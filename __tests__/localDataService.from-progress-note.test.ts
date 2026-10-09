// CG<-PN localDataService — ported from pt-progress-note
import { seedLegacyAdmin } from "./testAuth";
import { describe, it, expect, beforeEach } from "vitest";
import * as ds from "@/lib/localDataService";
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

beforeEach(async () => {
  // 각 테스트마다 깨끗한 localStorage 로 시작
  await seedLegacyAdmin();
});

describe("localDataService — change own password", () => {
  it("changes password and allows re-login with the new one (old one fails)", async () => {
    await ds.signIn("master", "0000"); // 세션 확보
    await ds.updateTherapistPassword("Newpass1!");

    // 새 비밀번호로 재로그인 성공, 기존 0000 은 실패
    const relogin = await ds.signIn("master", "Newpass1!");
    expect(relogin.therapist.id).toBe("master");
    await expect(ds.signIn("master", "0000")).rejects.toThrow(/ID 또는 비밀번호/);
  });

  it("can be changed repeatedly (no first-change lock)", async () => {
    await ds.signIn("master", "0000");
    await ds.updateTherapistPassword("first-11");
    await ds.updateTherapistPassword("second-2");
    await ds.updateTherapistPassword("third-33");

    expect(await ds.reauthenticate("master", "third-33")).toBe(true);
    expect(await ds.reauthenticate("master", "first-11")).toBe(false);
    expect(await ds.reauthenticate("master", "second-2")).toBe(false);
  });

  it("rejects changing to the default password 0000", async () => {
    await ds.signIn("master", "0000");
    await expect(ds.updateTherapistPassword("0000")).rejects.toThrow(/기본 비밀번호/);
  });

  it("regular therapist can change their own password", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapist("PT-001", "김치료", "Test1234!");
    await ds.signIn("PT-001", "Test1234!"); // 일반 치료사로 로그인 (세션 전환)

    await ds.updateTherapistPassword("Pt-secret9");
    expect(await ds.reauthenticate("PT-001", "Pt-secret9")).toBe(true);
    expect(await ds.reauthenticate("PT-001", "Test1234!")).toBe(false);
    // 마스터 계정은 영향 없음
    expect(await ds.reauthenticate("master", "0000")).toBe(true);
  });
});

describe("localDataService — painAreas migration", () => {
  it("migrates legacy Record<string, number> to PainEntry[] on fetch (view 역추정)", async () => {
    const legacyPainAreas = { "우측 대흉근": 2, "좌측 광배근": 3 };
    // 구버전 형식을 강제로 주입 (현재 타입은 PainEntry[] 라 캐스팅)
    await ds.upsertNote(sampleNote({ id: "legacy", painAreas: legacyPainAreas as never }));

    const all = await ds.fetchNotes();
    const note = all.find((n) => n.id === "legacy")!;
    // 대흉근은 전면 전용, 광배근은 후면 전용 부위 → view 가 정확히 복원됨
    expect(note.painAreas).toEqual(
      expect.arrayContaining([
        { view: "anterior", region: "우측 대흉근", painLevel: 2 },
        { view: "posterior", region: "좌측 광배근", painLevel: 3 },
      ])
    );
    expect(note.painAreas).toHaveLength(2);
  });

  it("clears unconvertible legacy string[] painAreas", async () => {
    await ds.upsertNote(sampleNote({ id: "veryold", painAreas: ["head", "neck"] as never }));
    const all = await ds.fetchNotes();
    expect(all.find((n) => n.id === "veryold")!.painAreas).toEqual([]);
  });
});

describe("localDataService — corrupt data safety", () => {
  it("preserves corrupt original data and blocks further saves", async () => {
    const raw = "corrupted-not-json{{{";
    window.localStorage.setItem("pt_local_notes", raw);
    await expect(ds.fetchNotes()).rejects.toThrow();
    await expect(ds.upsertNote(sampleNote({ id: "new-1" }))).rejects.toThrow();
    expect(window.localStorage.getItem("pt_local_notes")).toBe(raw);
  });

  it("migrates legacy plaintext notes to encrypted storage", async () => {
    const legacy = [sampleNote({ id: "legacy-1", patientName: "평문환자" })];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy));

    const notes = await ds.fetchNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].patientName).toBe("평문환자");

    // 읽는 순간 암호화로 업그레이드됨
    expect(window.localStorage.getItem("pt_local_notes")!).not.toContain("평문환자");
  });
});

describe("localDataService — import sanitize (임상 문구 보존)", () => {
  it("preserves clinical phrases like 'onset =' and 'pronation =' on import", async () => {
    const clinical = "onset = 3일 전, pronation = 80도, ONSET =급성";
    await ds.importNotes([
      sampleNote({ id: "clin-1", treatment: clinical, chiefComplaint: "onset = 2주 전" }),
    ]);

    const all = await ds.fetchNotes();
    const note = all.find((n) => n.id === "clin-1")!;
    expect(note.treatment).toBe(clinical);
    expect(note.chiefComplaint).toBe("onset = 2주 전");
  });

  it("still strips <script> blocks and inline event handler attributes", async () => {
    await ds.importNotes([
      sampleNote({
        id: "xss-1",
        treatment: '<script>alert(1)</script>치료 내용',
        chiefComplaint: '<img src=x onclick="alert(1)"> 주호소',
      }),
    ]);

    const all = await ds.fetchNotes();
    const note = all.find((n) => n.id === "xss-1")!;
    expect(note.treatment).not.toContain("<script");
    expect(note.treatment).toContain("치료 내용");
    expect(note.chiefComplaint).not.toMatch(/onclick\s*=\s*["']/i);
    expect(note.chiefComplaint).toContain("주호소");
  });
});

describe("localDataService — export security (v3)", () => {
  it("export excludes password hashes and marks version 3", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapist("PT-001", "김치료", "Secret1!");
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "김환자" }));

    const parsed = JSON.parse(await ds.exportAllData());
    expect(parsed.version).toBe(3);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.therapists.length).toBeGreaterThanOrEqual(2);
    for (const t of parsed.therapists) {
      expect(t.passwordHash).toBe("");
    }
    // 파일 문자열 어디에도 해시 파편이 남지 않아야 함
    expect(await ds.exportAllData()).not.toContain("pbkdf2v1:");
  });
});

describe("localDataService — master password reset", () => {
  it("rejects reset when session is not master", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapist("PT-001", "김치료", "Secret1!");
    const target = (await ds.fetchTherapists()).find((t) => t.id === "PT-001")!;

    await ds.signIn("PT-001", "Secret1!"); // 일반 치료사 세션으로 전환
    await expect(ds.resetTherapistPasswordDb(target.uid, "Hijack99!")).rejects.toThrow(
      /관리자 권한/
    );
  });

  it("enforces the password policy on reset", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapist("PT-001", "김치료", "Secret1!");
    const target = (await ds.fetchTherapists()).find((t) => t.id === "PT-001")!;

    await expect(ds.resetTherapistPasswordDb(target.uid, "0000")).rejects.toThrow(/기본 비밀번호/);
    await expect(ds.resetTherapistPasswordDb(target.uid, "abc")).rejects.toThrow(/8~20자/);
  });
});

describe("localDataService — registration password policy", () => {
  it("rejects weak or default passwords at the data layer (UI 우회 방어)", async () => {
    await ds.signIn("master", "0000");
    await expect(ds.createTherapist("PT-001", "김치료", "0000")).rejects.toThrow(
      /기본 비밀번호/
    );
    await expect(ds.createTherapist("PT-001", "김치료", "abc")).rejects.toThrow(
      /8~20자/
    );
    await expect(
      ds.createTherapist("PT-001", "김치료", "한글비밀번호여덟자")
    ).rejects.toThrow(/영문·숫자·특수문자/);
  });

  it("accepts alphanumeric/special passwords (숫자 전용 강제 아님)", async () => {
    await ds.signIn("master", "0000");
    const rec = await ds.createTherapist("PT-001", "김치료", "Pw-2026!");
    expect(rec.id).toBe("PT-001");
    const login = await ds.signIn("PT-001", "Pw-2026!");
    expect(login.therapist.id).toBe("PT-001");
  });
});

describe("localDataService — encrypted backup (passphrase)", () => {

  it("plain backups are not detected as encrypted", async () => {
    await ds.signIn("master", "0000");
    expect(ds.isEncryptedBackup(await ds.exportAllData())).toBe(false);
    expect(ds.isEncryptedBackup("not-json")).toBe(false);
  });
});

describe("localDataService — patientId", () => {

  it("distinguishes same-name patients by birth date (동명이인)", async () => {
    const a = await ds.upsertNote(
      sampleNote({ id: "a", chartNo: "", patientName: "김철수", birthDate: "1980-01-01" })
    );
    const b = await ds.upsertNote(
      sampleNote({ id: "b", chartNo: "", patientName: "김철수", birthDate: "1999-12-31" })
    );
    expect(b.patientId).not.toBe(a.patientId);
  });

  it("keeps the same patientId when re-saving a note without identifiers (no churn)", async () => {
    const first = await ds.upsertNote(
      sampleNote({ id: "x", chartNo: "", birthDate: "", patientName: "" })
    );
    // 폼이 patientId 를 돌려받지 못한 상황 시뮬레이션 — patientId 없이 같은 id 재저장
    const again = await ds.upsertNote(
      sampleNote({ id: "x", chartNo: "", birthDate: "", patientName: "" })
    );
    expect(first.patientId).toBeTruthy();
    expect(again.patientId).toBe(first.patientId);
  });

  it("does NOT merge same-name patients with different birth dates during backfill", async () => {
    const legacy = [
      sampleNote({ id: "p1", chartNo: "", patientName: "김철수", birthDate: "1980-01-01" }),
      sampleNote({ id: "p2", chartNo: "", patientName: "김철수", birthDate: "1999-12-31" }),
    ];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy)); // 구버전 평문 주입
    const all = await ds.fetchNotes();
    const a = all.find((n) => n.id === "p1")!;
    const b = all.find((n) => n.id === "p2")!;
    expect(a.patientId).toBeTruthy();
    expect(b.patientId).not.toBe(a.patientId); // 동명이인 보호
  });

  it("backfills patientId for legacy notes on fetch", async () => {
    const legacy = [
      sampleNote({ id: "l1", patientName: "이영희" }),
      sampleNote({ id: "l2", patientName: "이영희" }),
    ];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy)); // 구버전 평문 주입
    const all = await ds.fetchNotes();
    expect(all.every((n) => !!n.patientId)).toBe(true);
    expect(all[0].patientId).toBe(all[1].patientId);
  });
});
