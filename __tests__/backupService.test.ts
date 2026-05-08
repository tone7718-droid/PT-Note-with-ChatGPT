import { beforeEach, describe, expect, it } from "vitest";
import {
  createBackupPayload,
  listAutoBackups,
  parsePlainBackupText,
  saveAutoBackup,
  validateBackupPayload,
} from "@/lib/backupService";
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

  it("keeps the newest auto backups first and trims old entries", () => {
    for (let i = 0; i < 12; i++) {
      const payload = createBackupPayload({
        notes: [sampleNote(`n${i}`)],
        therapists: [],
        reason: "auto",
        now: new Date(`2026-05-06T12:${String(i).padStart(2, "0")}:00.000Z`),
      });
      saveAutoBackup(payload);
    }

    const backups = listAutoBackups();
    expect(backups).toHaveLength(10);
    expect(backups[0].createdAt).toBe("2026-05-06T12:11:00.000Z");
    expect(backups[9].createdAt).toBe("2026-05-06T12:02:00.000Z");
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
