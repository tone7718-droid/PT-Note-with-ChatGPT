import { seedLegacyAdmin, addTransferTarget } from "./testAuth";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_NOTE, type NoteData } from "@/types";
import * as ds from "@/lib/localDataService";
import { encryptData, encryptWithPassphrase, invalidateEncKeyCache } from "@/lib/cryptoService";
import { withDataLock } from "@/lib/storageLock";
import { listAutoBackups, readAutoBackupPayload } from "@/lib/backupService";
import { saveDraft, clearDraft } from "@/lib/draftNote";
const note = (id: string, overrides: Partial<NoteData> = {}): NoteData => ({
  ...EMPTY_NOTE, id, savedAt: "2026-01-01T00:00:00.000Z", patientId: "local-patient",
  patientName: "테스트 환자", chartNo: "C1", diagnosis: "테스트", ...overrides,
});
const account = { uid: "t1", id: "PT-001", name: "테스트 치료사", role: "therapist", resigned: false };
beforeEach(async () => { await seedLegacyAdmin(); invalidateEncKeyCache(); });
afterEach(() => vi.restoreAllMocks());
describe("storage safety", () => {
  it("retains both concurrent saves", async () => {
    await Promise.all([ds.upsertNote(note("a")), ds.upsertNote(note("b"))]);
    expect((await ds.fetchNotes()).map(n => n.id).sort()).toEqual(["a", "b"]);
  });
  it("serializes delete with independent save", async () => {
    await ds.upsertNote(note("a"));
    await Promise.all([ds.deleteNotes(["a"]), ds.upsertNote(note("b"))]);
    expect((await ds.fetchNotes()).map(n => n.id)).toEqual(["b"]);
  });
  it("rejects stale editing revisions", async () => {
    const original = await ds.upsertNote(note("a"));
    await ds.upsertNote(note("a", { savedAt: "2026-01-02T00:00:00Z", treatment: "other writer" }), original.savedAt);
    await expect(ds.upsertNote(note("a", { treatment: "stale" }), original.savedAt)).rejects.toThrow("다른 창");
    expect((await ds.fetchNotes())[0].treatment).toBe("other writer");
  });
  it("rejects editing that would undo another therapist transfer", async () => {
    const original = await ds.upsertNote(note("a", { therapistUid: "from" }));
    await addTransferTarget();
    await ds.transferNotesRpc("from", "to", "새 담당자", "PT-002");
    await expect(ds.upsertNote(original, original.savedAt)).rejects.toThrow("다른 창");
    expect((await ds.fetchNotes())[0].therapistUid).toBe("to");
  });
  it("does not resurrect a deleted record from a stale editor", async () => {
    const original = await ds.upsertNote(note("a"));
    await ds.deleteNotes(["a"]);
    await expect(ds.upsertNote(original, original.savedAt)).rejects.toThrow();
    expect(await ds.fetchNotes()).toEqual([]);
  });
  it("fails safely when Web Locks are unavailable", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks")!;
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    try {
      await expect(ds.upsertNote(note("a"))).rejects.toThrow("안전한 저장");
      expect(localStorage.getItem("pt_local_notes")).toBeNull();
    } finally { Object.defineProperty(navigator, "locks", descriptor); }
  });
  it("shares its lock across separate service instances", async () => {
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const hold = withDataLock(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
    await ready;
    vi.resetModules();
    const other = await import("@/lib/localDataService");
    let finished = false;
    const save = other.upsertNote(note("a")).then(() => { finished = true; });
    try { await new Promise(resolve => setTimeout(resolve, 10)); expect(finished).toBe(false); }
    finally { release(); await hold; await save; }
  });
  it("reports duplicates within a file and invalid rows", async () => {
    const result = await ds.importCompatibleBackup(JSON.stringify({ notes: [note("a"), note("a"), { id: "bad" }] }));
    expect(result).toMatchObject({ notesCount: 1, duplicateCount: 1, skippedCount: 1 });
  });
  it("imports hash-less accounts once per login ID", async () => {
    const result = await ds.importCompatibleBackup(JSON.stringify({ notes: [], therapists: [account, { ...account, uid: "t2" }] }));
    expect(result).toMatchObject({ therapistsCount: 1, duplicateCount: 1 });
    expect((await ds.fetchTherapists()).find(t => t.uid === "t1")?.passwordHash).toBe("");
  });
  it("reconciles foreign patient IDs against the local chart", async () => {
    await ds.upsertNote(note("a"));
    await ds.importCompatibleBackup(JSON.stringify({ notes: [note("b", { patientId: "foreign" })] }));
    expect(new Set((await ds.fetchNotes()).map(n => n.patientId)).size).toBe(1);
  });
  for (const producer of ["Progress", "Antigravity", "ChatGPT"]) {
    for (const encrypted of [false, true]) {
      it(`accepts ${producer} ${encrypted ? "encrypted" : "plain"} legacy backup`, async () => {
        const payload = { ...(producer === "ChatGPT" ? { app: "PT-NOTE", version: 3 } : { version: 1 }), notes: [note("imported")], therapists: [{ ...account, ...(producer === "Antigravity" ? {} : { passwordHash: "" }) }] };
        let text = JSON.stringify(payload);
        if (encrypted) text = JSON.stringify({ format: "ptnote-encrypted-v1", ...await encryptWithPassphrase(text, "test-password") });
        expect(await ds.importCompatibleBackup(text, "test-password")).toMatchObject({ notesCount: 1, therapistsCount: 1, skippedCount: 0 });
      });
    }
  }
  it("leaves data intact with a wrong backup password", async () => {
    await ds.upsertNote(note("a"));
    const original = localStorage.getItem("pt_local_notes");
    const text = await ds.exportAllDataEncrypted("test-password");
    await expect(ds.importCompatibleBackup(text, "wrong-password")).rejects.toThrow();
    expect(localStorage.getItem("pt_local_notes")).toBe(original);
  });
  it("does not generate a replacement for a missing encryption key", async () => {
    await ds.upsertNote(note("a"));
    const original = localStorage.getItem("pt_local_notes");
    localStorage.removeItem("pt_enc_key_v1");
    await expect(ds.upsertNote(note("b"))).rejects.toThrow();
    expect(localStorage.getItem("pt_enc_key_v1")).toBeNull();
    expect(localStorage.getItem("pt_local_notes")).toBe(original);
  });
  it("aborts deletion when required automatic backup cannot be saved", async () => {
    await ds.upsertNote(note("a"));
    const original = localStorage.getItem("pt_local_notes");
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key.startsWith("pt_auto_backup")) throw new DOMException("Quota", "QuotaExceededError");
      set.call(this, key, value);
    });
    await expect(ds.deleteNotes(["a"])).rejects.toThrow();
    expect(localStorage.getItem("pt_local_notes")).toBe(original);
  });
  it("rolls back both stores after a partial import failure", async () => {
    await ds.fetchTherapists(); await ds.upsertNote(note("a"));
    const notes = localStorage.getItem("pt_local_notes"), therapists = localStorage.getItem("pt_local_therapists");
    const set = Storage.prototype.setItem; let failed = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === "pt_local_therapists" && !failed) { failed = true; throw new Error("disk full"); }
      set.call(this, key, value);
    });
    await expect(ds.importCompatibleBackup(JSON.stringify({ notes: [note("b")], therapists: [account] }))).rejects.toThrow();
    expect(localStorage.getItem("pt_local_notes")).toBe(notes);
    expect(localStorage.getItem("pt_local_therapists")).toBe(therapists);
    expect(localStorage.getItem("pt_pending_write_v1")).toBeNull();
  });
  it("recovers an interrupted import before the next read", async () => {
    await ds.upsertNote(note("before"));
    const original = localStorage.getItem("pt_local_notes");
    localStorage.setItem("pt_pending_write_v1", JSON.stringify({ pt_local_notes: original }));
    localStorage.setItem("pt_local_notes", await encryptData(JSON.stringify([note("partial")])));
    expect((await ds.fetchNotes()).map(n => n.id)).toEqual(["before"]);
    expect(localStorage.getItem("pt_pending_write_v1")).toBeNull();
  });
  it("does not start import if the recovery journal cannot be written", async () => {
    await ds.fetchTherapists(); await ds.upsertNote(note("a"));
    const original = localStorage.getItem("pt_local_notes"); const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === "pt_pending_write_v1") throw new Error("disk full");
      set.call(this, key, value);
    });
    await expect(ds.importCompatibleBackup(JSON.stringify({ notes: [note("b")] }))).rejects.toThrow();
    expect(localStorage.getItem("pt_local_notes")).toBe(original);
  });
  it("restores the previous contents of an existing note", async () => {
    await ds.upsertNote(note("a", { treatment: "before" }));
    await ds.upsertNote(note("a", { treatment: "after", savedAt: "2026-01-02T00:00:00Z" }));
    const backup = listAutoBackups()[0]; await ds.restoreNoteSnapshot((await readAutoBackupPayload(backup)).notes);
    expect((await ds.fetchNotes())[0].treatment).toBe("before");
  });
  it("clears drafts after pending save and reports quota failures", async () => {
    await Promise.all([saveDraft(note("draft")), clearDraft()]);
    expect(localStorage.getItem("pt_draft_note")).toBeNull();
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === "pt_draft_note") throw new Error("disk full");
      set.call(this, key, value);
    });
    await expect(saveDraft(note("draft"))).rejects.toThrow("disk full");
  });
});
