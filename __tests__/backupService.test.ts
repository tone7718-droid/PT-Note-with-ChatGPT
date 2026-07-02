import { beforeEach, describe, expect, it } from "vitest";
import {
  createBackupPayload,
  listAutoBackups,
  parsePlainBackupText,
  readAutoBackupPayload,
  saveAutoBackup,
  validateBackupPayload,
} from "@/lib/backupService";
import { invalidateEncKeyCache } from "@/lib/cryptoService";
import type { NoteData, TherapistRecord } from "@/types";

const sampleNote = (id: string): NoteData => ({
  id,
  savedAt: "2026-05-06T12:00:00.000Z",
  patientName: "홍길동",
  chartNo: "0001",
  birthDate: "1990-01-01",
  gender: "M",
  diagnosis: "허리 통증",
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
  noteDate: "2026-05-06",
  therapist: null,
  therapistUid: "",
});

const sampleTherapist = (uid: string): TherapistRecord => ({
  uid,
  id: "PT-001",
  name: "김치료",
  passwordHash: "hash",
  role: "therapist",
  resigned: false,
});

beforeEach(() => {
  window.localStorage.clear();
  invalidateEncKeyCache();
});

describe("backupService", () => {
  it("creates and validates a plain backup payload", () => {
    const payload = createBackupPayload({
      notes: [sampleNote("n1")],
      therapists: [sampleTherapist("t1")],
      reason: "manual",
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(payload.app).toBe("PT-NOTE");
    expect(payload.version).toBe(3);
    expect(validateBackupPayload(payload)).toEqual({
      notesCount: 1,
      therapistsCount: 1,
    });
  });

  it("rejects malformed backup payloads", () => {
    expect(() => validateBackupPayload({ notes: "bad" })).toThrow(/백업 파일/);
  });

  it("keeps the newest auto backups first and trims old entries", async () => {
    for (let i = 0; i < 7; i++) {
      const payload = createBackupPayload({
        notes: [sampleNote(`n${i}`)],
        therapists: [],
        reason: "auto",
        now: new Date(`2026-05-06T12:${String(i).padStart(2, "0")}:00.000Z`),
      });
      await saveAutoBackup(payload);
    }

    const backups = listAutoBackups();
    expect(backups).toHaveLength(5);
    expect(backups[0].createdAt).toBe("2026-05-06T12:06:00.000Z");
    expect(backups[4].createdAt).toBe("2026-05-06T12:02:00.000Z");
  });

  it("stores auto backup payloads encrypted and restores them via readAutoBackupPayload", async () => {
    const payload = createBackupPayload({
      notes: [sampleNote("enc-1")],
      therapists: [sampleTherapist("t1")],
      reason: "auto",
      now: new Date("2026-05-06T12:00:00.000Z"),
    });
    await saveAutoBackup(payload);

    // 저장된 원본(localStorage)에 환자 이름 평문이 노출되지 않아야 함
    const raw = window.localStorage.getItem("pt_auto_backups")!;
    expect(raw).not.toContain("홍길동");

    const restored = await readAutoBackupPayload(listAutoBackups()[0]);
    expect(restored.notes[0].id).toBe("enc-1");
    expect(restored.notes[0].patientName).toBe("홍길동");
  });

  it("reads legacy plaintext auto backup entries", async () => {
    const payload = createBackupPayload({
      notes: [sampleNote("legacy-1")],
      therapists: [],
      reason: "auto",
      now: new Date("2026-05-06T12:00:00.000Z"),
    });
    const legacyEntry = {
      id: "backup-legacy",
      createdAt: payload.exportedAt,
      reason: payload.reason,
      notesCount: 1,
      therapistsCount: 0,
      payload, // 암호화 도입 전 평문 엔트리
    };
    window.localStorage.setItem("pt_auto_backups", JSON.stringify([legacyEntry]));

    const restored = await readAutoBackupPayload(listAutoBackups()[0]);
    expect(restored.notes[0].id).toBe("legacy-1");
  });

  it("sanitize does not mangle clinical text like 'onset =' or 'pronation ='", () => {
    const note = sampleNote("clinical");
    note.chiefComplaint = "onset = 2 weeks ago, condition = stable";
    note.treatment = "pronation = 80°, supination = 75°";
    note.postural = `<script>alert(1)</script><img onerror="alert(1)" src=x>`;

    const payload = createBackupPayload({
      notes: [note],
      therapists: [],
      reason: "manual",
      now: new Date("2026-05-06T12:00:00.000Z"),
    });
    validateBackupPayload(payload);

    expect(payload.notes[0].chiefComplaint).toBe("onset = 2 weeks ago, condition = stable");
    expect(payload.notes[0].treatment).toBe("pronation = 80°, supination = 75°");
    expect(payload.notes[0].postural).not.toContain("<script>");
    expect(payload.notes[0].postural).not.toContain('onerror="');
  });

  it("parses plain backup text without a passphrase", () => {
    const payload = createBackupPayload({
      notes: [sampleNote("plain")],
      therapists: [sampleTherapist("t1")],
      reason: "manual",
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    const parsed = parsePlainBackupText(JSON.stringify(payload));
    expect(parsed.notes[0].id).toBe("plain");
    expect(parsed.therapists[0].uid).toBe("t1");
  });
});
