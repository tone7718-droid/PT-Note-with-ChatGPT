import { beforeEach, afterEach, it, expect, vi } from "vitest";
import * as ds from "@/lib/localDataService";
import { EMPTY_NOTE, type NoteData } from "@/types";
import { seedLegacyAdmin, addTransferTarget } from "./testAuth";
import { currentActor } from "@/lib/accessControl";
import { saveEditorDraft, listEditorDrafts, removeEditorDraft } from "@/lib/editorDraft";
import { romAngles, romKey, romSeries } from "@/lib/romMeasurement";
import { invalidateEncKeyCache } from "@/lib/cryptoService";
const note = (id: string, extra: Partial<NoteData> = {}): NoteData => ({ ...EMPTY_NOTE, id, savedAt: "2026-01-01T00:00:00Z", patientName: "테스트", diagnosis: "테스트", ...extra });
beforeEach(async () => { await seedLegacyAdmin(); invalidateEncKeyCache(); });
afterEach(() => vi.restoreAllMocks());
it("requires explicit administrator setup on a new installation", async () => {
  localStorage.clear(); sessionStorage.clear();
  expect(await ds.isSetupRequired()).toBe(true);
  await expect(ds.signIn("master", "0000")).rejects.toThrow();
  expect(localStorage.getItem("pt_local_therapists")).toBeNull();
  await expect(ds.setupInitialMaster("원장", "1234")).rejects.toThrow();
  await ds.setupInitialMaster("원장", "SafePass1!");
  await ds.signIn("master", "SafePass1!");
  expect(currentActor().name).toBe("원장");
  await expect(ds.setupInitialMaster("공격자", "SafePass2!")).rejects.toThrow();
});
it("rejects all clinical access without a current authenticated account", async () => {
  await ds.signOut();
  await expect(ds.fetchNotes()).rejects.toThrow();
  await expect(ds.upsertNote(note("a"))).rejects.toThrow();
  await expect(ds.deleteNotes(["a"])).rejects.toThrow();
  await expect(ds.importCompatibleBackup('{"notes":[]}')).rejects.toThrow();
  await expect(ds.exportAllData()).rejects.toThrow();
});
it("isolates staff records and rejects direct administrator API calls", async () => {
  await addTransferTarget("staff", "PT-002");
  await ds.upsertNote(note("private"));
  await ds.signIn("PT-002", "test-password");
  expect(await ds.fetchNotes()).toEqual([]);
  await expect(ds.upsertNote(note("private"))).rejects.toThrow("권한");
  await expect(ds.deleteNotes(["private"])).rejects.toThrow("권한");
  await expect(ds.importCompatibleBackup('{"notes":[]}')).rejects.toThrow("관리자");
  await expect(ds.exportAllData()).rejects.toThrow("관리자");
  await expect(ds.resignTherapistDb("master-default")).rejects.toThrow("관리자");
  await expect(ds.fetchRecordHistory("private")).rejects.toThrow("권한");
  expect((await ds.fetchTherapists()).every(t => t.passwordHash === "")).toBe(true);
});
it("does not trust a caller-supplied session role and revokes resigned sessions", async () => {
  await addTransferTarget("staff", "PT-002"); await ds.signIn("PT-002", "test-password");
  const token = JSON.parse(sessionStorage.getItem("pt_local_session")!); token.role = "master";
  sessionStorage.setItem("pt_local_session", JSON.stringify(token));
  await expect(ds.exportAllData()).rejects.toThrow();
  const records = JSON.parse(localStorage.getItem("pt_local_therapists")!);
  records.find((t: { uid: string }) => t.uid === "staff").resigned = true;
  localStorage.setItem("pt_local_therapists", JSON.stringify(records));
  await expect(ds.fetchNotes()).rejects.toThrow("세션");
});
it("preserves the original author, tracks editor and assignee separately", async () => {
  await addTransferTarget();
  const original = await ds.upsertNote(note("a", { treatment: "before" }));
  expect(original.createdBy?.uid).toBe("master-default");
  await ds.transferNotesRpc("master-default", "to", "ignored forged name", "wrong-id");
  await ds.signIn("PT-002", "test-password");
  const assigned = (await ds.fetchNotes())[0];
  const saved = await ds.upsertNote({ ...assigned, treatment: "after", savedAt: "2026-01-02T00:00:00Z", createdBy: currentActor(), createdAt: "2000-01-01T00:00:00Z" }, assigned.savedAt);
  expect(saved.createdBy?.uid).toBe("master-default");
  expect(saved.createdAt).toBe(original.createdAt);
  expect(saved.updatedBy?.uid).toBe("to"); expect(saved.therapistUid).toBe("to");
  const entries = await ds.fetchRecordHistory("a");
  expect(entries.map(e => e.action)).toContain("transferNotesRpc");
  expect(entries.at(-1)?.changes.treatment).toEqual({ before: "before", after: "after" });
  expect(entries.at(-1)?.actor.uid).toBe("to");
});
it("keeps more than five edits and retains deletion history", async () => {
  let saved = await ds.upsertNote(note("a"));
  for (let i = 0; i < 7; i++) saved = await ds.upsertNote({ ...saved, treatment: String(i), savedAt: `2026-01-0${i+2}T00:00:00Z` }, saved.savedAt);
  await ds.deleteNotes(["a"]);
  const history = await ds.fetchRecordHistory("a");
  expect(history.length).toBeGreaterThan(5); expect(history.at(-1)?.action).toBe("delete");
  expect(localStorage.getItem("pt_record_history_v1")).not.toContain("테스트");
});
it("rolls back note bytes if saving history fails", async () => {
  const old = await ds.upsertNote(note("a"));
  const raw = localStorage.getItem("pt_local_notes"), history = localStorage.getItem("pt_record_history_v1");
  const set = Storage.prototype.setItem; let failed = false;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
    if (key === "pt_record_history_v1" && !failed) { failed = true; throw new Error("quota"); }
    set.call(this, key, value);
  });
  await expect(ds.upsertNote({ ...old, treatment: "lost" }, old.savedAt)).rejects.toThrow();
  expect(localStorage.getItem("pt_local_notes")).toBe(raw);
  expect(localStorage.getItem("pt_record_history_v1")).toBe(history);
});
it("preserves drafts across record switches, logout and module restart", async () => {
  await saveEditorDraft("master-default", "a", note("a", { treatment: "unsaved A" }));
  await saveEditorDraft("master-default", "b", note("b", { treatment: "unsaved B" }));
  await ds.signOut();
  await expect(listEditorDrafts("master-default", "a")).rejects.toThrow();
  await ds.signIn("master", "0000");
  vi.resetModules(); const drafts = await import("@/lib/editorDraft");
  expect((await drafts.listEditorDrafts("master-default", "a"))[0].data.treatment).toBe("unsaved A");
  expect((await drafts.listEditorDrafts("master-default", "b"))[0].data.treatment).toBe("unsaved B");
  expect(await ds.fetchNotes()).toEqual([]);
});
it("isolates drafts by account and reports draft quota failures", async () => {
  await saveEditorDraft("master-default", null, note("a"));
  await addTransferTarget(); await ds.signIn("PT-002", "test-password");
  await expect(listEditorDrafts("master-default", null)).rejects.toThrow("권한");
  expect(await listEditorDrafts("to", null)).toEqual([]);
  const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
    if (key.startsWith("pt_editor_draft_v1:")) throw new Error("quota"); set.call(this, key, value);
  });
  await expect(saveEditorDraft("to", null, note("b"))).rejects.toThrow("quota");
});
it("clearing an in-flight draft cannot resurrect it", async () => {
  await Promise.all([saveEditorDraft("master-default", "a", note("a")), removeEditorDraft("master-default", "a")]);
  expect(await listEditorDrafts("master-default", "a")).toEqual([]);
});
it("keeps ambiguous ROM text and structures explicit ranges without truncation", () => {
  const row = { joint: "팔꿈치", measuredROM: "20~100", normalRange: "" };
  expect(romAngles(row)).toEqual({ start: 20, end: 100 });
  expect(romAngles({ ...row, measuredROM: "90/120" })).toBeNull();
  expect(romAngles({ ...row, measuredROM: "120°" })).toEqual({ start: null, end: 120 });
  expect(romAngles({ ...row, startAngle: -10, endAngle: 100 })).toEqual({ start: -10, end: 100 });
  expect(romAngles({ ...row, measuredROM: "120foo" })).toBeNull();
  expect(romKey({ ...row, side: "left" })).not.toBe(romKey({ ...row, side: "right" }));
  expect(romKey({ ...row, mode: "AROM" })).not.toBe(romKey({ ...row, mode: "PROM" }));
  expect(romSeries([note("a", { rom: [row, row] })], romKey(row))[0]).toMatchObject({ ambiguous: true, end: null });
});
it("preserves structured ROM and raw text through backup exchange", async () => {
  const row = { joint: "팔꿈치", movement: "굽힘", side: "left" as const, mode: "PROM" as const, startAngle: 20, endAngle: 100, measuredROM: "90/120", normalRange: "" };
  await ds.importCompatibleBackup(JSON.stringify({ notes: [note("a", { rom: [row] })] }));
  expect((await ds.fetchNotes())[0].rom[0]).toMatchObject(row);
  const exported = JSON.parse(await ds.exportAllData());
  expect(exported.notes[0].rom[0]).toMatchObject(row); expect(exported.history.length).toBeGreaterThan(0);
});

it("imports history with provenance while retaining a local import event", async () => {
  await ds.upsertNote(note("history-source", { treatment: "before" }));
  const backup = await ds.exportAllData();
  await seedLegacyAdmin(); invalidateEncKeyCache();
  await ds.importCompatibleBackup(backup);
  const entries = await ds.fetchRecordHistory("history-source");
  expect(entries.some(entry => entry.source?.originalId)).toBe(true);
  expect(entries.some(entry => !entry.source && entry.action === "importCompatibleBackup")).toBe(true);
});
