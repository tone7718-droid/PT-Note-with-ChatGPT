import { describe, it, expect, beforeEach } from "vitest";
import * as ds from "@/lib/localDataService";
import { listAutoBackups, readAutoBackupPayload } from "@/lib/backupService";
import { invalidateEncKeyCache } from "@/lib/cryptoService";
import { verifyPassword } from "@/lib/hashUtils";
import type { NoteData } from "@/types";

const sampleNote = (overrides: Partial<NoteData> = {}): NoteData => ({
  id: `note-${Math.random().toString(36).slice(2, 9)}`,
  savedAt: new Date().toISOString(),
  patientName: "홍길동",
  chartNo: "0001",
  birthDate: "1990-01-01",
  gender: "M",
  diagnosis: "",
  pmh: "",
  painScore: null,
  painAreas: [],
  chiefComplaint: "",
  rom: [],
  postural: "",
  palpation: "",
  specialTest: "",
  treatment: "",
  homeExercise: "",
  noteDate: "2026-04-28",
  therapist: null,
  therapistUid: "",
  ...overrides,
});

beforeEach(() => {
  // 각 테스트마다 깨끗한 localStorage 로 시작
  window.localStorage.clear();
  invalidateEncKeyCache();
});

describe("localDataService — auth", () => {
  it("first signIn bootstraps default master account (master / 0000)", async () => {
    const result = await ds.signIn("master", "0000");
    expect(result.therapist.role).toBe("master");
    expect(result.therapist.id).toBe("master");
  });

  it("signIn rejects wrong password with friendly message", async () => {
    await expect(ds.signIn("master", "wrong")).rejects.toThrow(
      /ID 또는 비밀번호/
    );
  });

  it("signIn rejects unknown ID", async () => {
    await expect(ds.signIn("nobody", "0000")).rejects.toThrow(
      /ID 또는 비밀번호/
    );
  });

  it("reauthenticate succeeds with correct password", async () => {
    await ds.signIn("master", "0000"); // bootstrap master
    expect(await ds.reauthenticate("master", "0000")).toBe(true);
    expect(await ds.reauthenticate("master", "wrong")).toBe(false);
  });

  it("signIn ignores login ID casing", async () => {
    const result = await ds.signIn("MASTER", "0000");
    expect(result.therapist.id).toBe("master");
  });

  it("signIn flags default password usage", async () => {
    const withDefault = await ds.signIn("master", "0000");
    expect(withDefault.usingDefaultPassword).toBe(true);

    await ds.updateTherapistPassword("new-pass-1");
    const withCustom = await ds.signIn("master", "new-pass-1");
    expect(withCustom.usingDefaultPassword).toBe(false);
  });
});

describe("localDataService — notes CRUD", () => {
  it("upsertNote inserts new note and fetchNotes returns it", async () => {
    const note = sampleNote({ patientName: "김환자", id: "n1" });
    await ds.upsertNote(note);

    const all = await ds.fetchNotes();
    expect(all).toHaveLength(1);
    expect(all[0].patientName).toBe("김환자");
    expect(all[0].id).toBe("n1");
  });

  it("upsertNote updates existing note in place (not duplicate)", async () => {
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "원래" }));
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "수정됨" }));

    const all = await ds.fetchNotes();
    expect(all).toHaveLength(1);
    expect(all[0].patientName).toBe("수정됨");
  });

  it("fetchNotes sorts by savedAt descending (newest first)", async () => {
    await ds.upsertNote(
      sampleNote({ id: "old", savedAt: "2026-01-01T00:00:00Z" })
    );
    await ds.upsertNote(
      sampleNote({ id: "mid", savedAt: "2026-03-01T00:00:00Z" })
    );
    await ds.upsertNote(
      sampleNote({ id: "new", savedAt: "2026-06-01T00:00:00Z" })
    );

    const all = await ds.fetchNotes();
    expect(all.map((n) => n.id)).toEqual(["new", "mid", "old"]);
  });

  it("deleteNotes removes specified ids only", async () => {
    await ds.upsertNote(sampleNote({ id: "a" }));
    await ds.upsertNote(sampleNote({ id: "b" }));
    await ds.upsertNote(sampleNote({ id: "c" }));

    await ds.deleteNotes(["a", "c"]);

    const all = await ds.fetchNotes();
    expect(all.map((n) => n.id)).toEqual(["b"]);
  });

  it("deleteNotes is no-op for non-existent ids", async () => {
    await ds.upsertNote(sampleNote({ id: "a" }));
    await ds.deleteNotes(["does-not-exist"]);
    expect(await ds.fetchNotes()).toHaveLength(1);
  });

  it("deleteNotes stores an automatic backup before removing notes", async () => {
    await ds.upsertNote(sampleNote({ id: "a" }));
    await ds.deleteNotes(["a"]);

    expect(await ds.fetchNotes()).toHaveLength(0);
    const backups = listAutoBackups();
    expect(backups).toHaveLength(1);
    const payload = await readAutoBackupPayload(backups[0]);
    expect(payload.notes.map((n) => n.id)).toEqual(["a"]);
  });

  it("importBackupPayload merges notes and therapists without duplicating existing ids", async () => {
    await ds.upsertNote(sampleNote({ id: "existing" }));
    const payload = await ds.buildBackupPayload("manual");
    payload.notes.push(sampleNote({ id: "imported" }));
    payload.therapists.push({
      uid: "t1",
      id: "PT-001",
      name: "김치료",
      passwordHash: "hash",
      role: "therapist",
      resigned: false,
    });

    const result = await ds.importBackupPayload(payload);

    expect(result).toEqual({ notesCount: 1, therapistsCount: 1 });
    expect((await ds.fetchNotes()).map((n) => n.id).sort()).toEqual(["existing", "imported"]);
    expect((await ds.fetchTherapists()).some((t) => t.uid === "t1")).toBe(true);
  });
});

describe("localDataService — export / import security", () => {
  it("exportAllData strips password hashes from the backup file", async () => {
    await ds.signIn("master", "0000"); // bootstrap master
    const json = await ds.exportAllData();
    expect(json).not.toMatch(/pbkdf2v1:/);
    const parsed = JSON.parse(json);
    expect(parsed.therapists[0].passwordHash).toBe("");
  });

  it("importBackupPayload restores hash-less therapists as login-locked (no default password)", async () => {
    await ds.signIn("master", "0000");
    const payload = await ds.buildBackupPayload("manual");
    payload.therapists.push({
      uid: "t-nohash",
      id: "PT-009",
      name: "복원치료사",
      passwordHash: "", // 내보내기 파일에는 해시가 없음
      role: "therapist",
      resigned: false,
    });

    await ds.importBackupPayload(payload);

    // 유출된 백업 파일만으로 "0000" 로그인이 되면 안 됨 — 잠금 상태로 복원
    const imported = (await ds.fetchTherapists()).find((t) => t.uid === "t-nohash")!;
    expect(imported.passwordHash).toBe("");
    expect(await verifyPassword("0000", imported.passwordHash)).toBe(false);
    await expect(ds.signIn("PT-009", "0000")).rejects.toThrow("비밀번호가 설정되지 않은 계정");
  });

  it("importNotes (레거시/호환 경로) sanitizes strings and drops malformed notes", async () => {
    const clinical = "onset = 3일 전, pronation = 80도";
    const count = await ds.importNotes([
      sampleNote({ id: "leg-1", treatment: clinical, chiefComplaint: '<script>x</script><img onclick="a"> 주호소' }),
      { id: "", savedAt: "2026-01-01" } as NoteData, // id 없음 → 제외
      { patientName: "no-id" } as NoteData, // id/savedAt 없음 → 제외
    ]);
    expect(count).toBe(1);

    const note = (await ds.fetchNotes()).find((n) => n.id === "leg-1")!;
    expect(note.treatment).toBe(clinical); // 임상 문구 보존
    expect(note.chiefComplaint).not.toContain("<script");
    expect(note.chiefComplaint).not.toMatch(/onclick\s*=\s*["']/i);
    expect(note.chiefComplaint).toContain("주호소");
  });
});

describe("localDataService — 암호화 백업 (passphrase, 해시 유지)", () => {
  it("encrypted backup keeps password hashes and restores working credentials", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapist("PT-001", "김치료", "Secret1!");
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "김환자" }));

    const encText = await ds.exportAllDataEncrypted("backup-pass-123");
    expect(ds.isEncryptedBackup(encText)).toBe(true);
    expect(encText).not.toContain("김환자"); // 환자정보 평문 미노출
    expect(encText).not.toContain("pbkdf2v1:"); // 해시도 평문 미노출

    // 새 기기 시뮬레이션
    window.localStorage.clear();
    invalidateEncKeyCache();
    await ds.signIn("master", "0000");

    const plain = await ds.decryptBackupText(encText, "backup-pass-123");
    const payload = JSON.parse(plain);
    expect(payload.therapists.some((t: { passwordHash: string }) => t.passwordHash)).toBe(true); // 해시 유지
    await ds.importBackupPayload(payload);

    // 기존 비밀번호 그대로 로그인 가능 — "0000 초기화" 없이 복원됨
    const relogin = await ds.signIn("PT-001", "Secret1!");
    expect(relogin.therapist.id).toBe("PT-001");
    expect((await ds.fetchNotes()).some((n) => n.patientName === "김환자")).toBe(true);
  });

  it("rejects a wrong passphrase", async () => {
    await ds.signIn("master", "0000");
    const encText = await ds.exportAllDataEncrypted("correct-pass-1");
    await expect(ds.decryptBackupText(encText, "wrong-pass-99")).rejects.toThrow(/백업 암호/);
  });
});

describe("localDataService — patientId", () => {
  it("assigns a patientId on save and groups by chart number", async () => {
    const a = await ds.upsertNote(sampleNote({ id: "a", chartNo: "C-100" }));
    const b = await ds.upsertNote(sampleNote({ id: "b", chartNo: "C-100" }));
    expect(a.patientId).toBeTruthy();
    expect(b.patientId).toBe(a.patientId);
  });

  it("keeps the same patientId when re-saving without identifiers (no churn)", async () => {
    const first = await ds.upsertNote(sampleNote({ id: "x", chartNo: "", birthDate: "", patientName: "" }));
    const again = await ds.upsertNote(sampleNote({ id: "x", chartNo: "", birthDate: "", patientName: "" }));
    expect(again.patientId).toBe(first.patientId);
  });

  it("remaps imported patientIds to the local patient (기기 간 재조정)", async () => {
    const local = await ds.upsertNote(sampleNote({ id: "loc-1", chartNo: "C-7" }));
    await ds.importNotes([sampleNote({ id: "imp-1", chartNo: "C-7", patientId: "foreign-pid" })]);
    const imported = (await ds.fetchNotes()).find((n) => n.id === "imp-1")!;
    expect(imported.patientId).toBe(local.patientId);
  });
});

describe("localDataService — decrypt failure safety", () => {
  it("preserves the original ciphertext when the encryption key is lost", async () => {
    await ds.upsertNote(sampleNote({ id: "n1" }));
    const original = window.localStorage.getItem("pt_local_notes")!;

    // 암호화 키 유실 시뮬레이션 — 다른 키로 교체
    window.localStorage.setItem("pt_enc_key_v1", "00".repeat(32));
    invalidateEncKeyCache();

    expect(await ds.fetchNotes()).toEqual([]); // 복호화 불가
    // 원본 암호문이 복구 슬롯에 보존되어야 함
    expect(window.localStorage.getItem("pt_local_notes_recovery_v1")).toBe(original);

    // 이후 저장이 일어나도 보존본은 유지
    await ds.upsertNote(sampleNote({ id: "n2" }));
    expect(window.localStorage.getItem("pt_local_notes_recovery_v1")).toBe(original);
  });
});

describe("localDataService — note transfer", () => {
  it("transferNotesRpc reassigns notes from one therapist to another", async () => {
    await ds.upsertNote(
      sampleNote({ id: "n1", therapistUid: "uid-A" })
    );
    await ds.upsertNote(
      sampleNote({ id: "n2", therapistUid: "uid-A" })
    );
    await ds.upsertNote(
      sampleNote({ id: "n3", therapistUid: "uid-B" })
    );

    const count = await ds.transferNotesRpc("uid-A", "uid-B", "B-치료사", "PT-002");
    expect(count).toBe(2);

    const all = await ds.fetchNotes();
    const n1 = all.find((n) => n.id === "n1")!;
    const n3 = all.find((n) => n.id === "n3")!;
    expect(n1.therapistUid).toBe("uid-B");
    expect(n1.therapist?.name).toBe("B-치료사");
    expect(n3.therapistUid).toBe("uid-B"); // 기존 그대로
  });
});
