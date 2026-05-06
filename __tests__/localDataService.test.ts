import { describe, it, expect, beforeEach } from "vitest";
import * as ds from "@/lib/localDataService";
import { listAutoBackups } from "@/lib/backupService";
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
    expect(backups[0].payload.notes.map((n) => n.id)).toEqual(["a"]);
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
