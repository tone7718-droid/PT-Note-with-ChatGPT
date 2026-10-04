import { beforeEach, it, expect } from "vitest";
import * as ds from "@/lib/localDataService";
import { EMPTY_NOTE } from "@/types";
import { invalidateEncKeyCache } from "@/lib/cryptoService";
import { readHistory } from "@/lib/recordHistory";
import { saveEditorDraft, deleteEditorDraft, listEditorDrafts } from "@/lib/editorDraft";
import { copyNote } from "@/lib/copyNote";
const n = (id: string, extra = {}) => ({ ...EMPTY_NOTE, id, savedAt: "2026-10-01T00:00:00Z", patientName: "가상환자", diagnosis: "검증용", ...extra });
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); invalidateEncKeyCache();
  await ds.setupInitialMaster("검증 관리자", "TestPass1!"); await ds.signIn("master", "TestPass1!");
});
it("rejects oversized input before modifying notes or history and preserves caller input", async () => {
  await ds.upsertNote(n("valid", { treatment: "x".repeat(20000) }));
  const before = localStorage.getItem("pt_local_notes"), history = localStorage.getItem("pt_record_history_v1");
  const input = n("oversize", { treatment: "x".repeat(20001) });
  await expect(ds.upsertNote(input)).rejects.toThrow();
  expect(input.treatment).toHaveLength(20001);
  expect(localStorage.getItem("pt_local_notes")).toBe(before);
  expect(localStorage.getItem("pt_record_history_v1")).toBe(history);
  expect(await ds.fetchNotes()).toHaveLength(1); await expect(ds.exportAllData()).resolves.toBeTruthy();
});
it("separates different chart numbers even with identical demographics", async () => {
  const a = await ds.upsertNote(n("a", { chartNo: "A001", birthDate: "1980-01-01" }));
  const b = await ds.upsertNote(n("b", { chartNo: "B999", birthDate: "1980-01-01" }));
  expect(a.patientId).not.toBe(b.patientId);
});
it("detaches a copied patient ID when a new record has different identity", async () => {
  const a = await ds.upsertNote(n("a", { chartNo: "A001", birthDate: "1980-01-01" }));
  const b = await ds.upsertNote({ ...a, id: "b", patientName: "다른 환자", chartNo: "B002", birthDate: "1990-02-02" });
  expect(a.patientId).not.toBe(b.patientId);
  await expect(ds.upsertNote({ ...a, chartNo: "B002" })).rejects.toThrow("환자");
  expect((await ds.fetchNotes()).find(x => x.id === "a")?.chartNo).toBe("A001");
});
it("retains deleted-record history on a fresh import and deduplicates repeat imports", async () => {
  await ds.upsertNote(n("deleted")); await ds.deleteNotes(["deleted"]); const backup = await ds.exportAllData();
  const original = JSON.parse(backup).history;
  localStorage.clear(); sessionStorage.clear(); invalidateEncKeyCache();
  await ds.setupInitialMaster("새 관리자", "TestPass1!"); await ds.signIn("master", "TestPass1!");
  await ds.importCompatibleBackup(backup);
  const imported = await readHistory(); expect(imported).toHaveLength(original.length);
  expect(imported.every(e => e.source?.importedBy === "master-default")).toBe(true);
  await ds.importCompatibleBackup(backup); expect(await readHistory()).toHaveLength(imported.length);
});
it("imports additional audit history for an already present note", async () => {
  await ds.upsertNote(n("present"));
  const backup = JSON.parse(await ds.exportAllData());
  backup.history.push({ ...backup.history[0], id: "external-later", action: "external-edit" });
  await ds.importCompatibleBackup(JSON.stringify(backup));
  expect((await readHistory()).some(e => e.source?.originalId === "external-later")).toBe(true);
  const count = (await readHistory()).length;
  await ds.importCompatibleBackup(JSON.stringify(backup)); expect(await readHistory()).toHaveLength(count);
});
it("rejects malformed history even when no notes are imported", async () => {
  await expect(ds.importCompatibleBackup(JSON.stringify({ notes: [], history: {} }))).rejects.toThrow("이력");
});
it("keeps colliding staff identity locked and allows explicit administrator assignment", async () => {
  const local = await ds.createTherapist("PT-001", "기존 치료사", "TestPass1!");
  const outsider = { uid: "foreign-uid", id: "PT-001", name: "가져온 치료사", role: "therapist", resigned: false, passwordHash: "" };
  const result = await ds.importCompatibleBackup(JSON.stringify({ notes: [n("foreign", { therapistUid: outsider.uid, therapist: outsider })], therapists: [outsider] }));
  expect(result.unassignedTherapistsCount).toBe(1);
  expect((await ds.fetchTherapists()).find(x => x.uid === outsider.uid)).toMatchObject({ id: null, passwordHash: "", importUnassigned: true });
  await ds.signIn("PT-001", "TestPass1!"); expect(await ds.fetchNotes()).toHaveLength(0);
  await ds.signIn("master", "TestPass1!"); await ds.transferNotesRpc(outsider.uid, local.uid, local.name, local.id);
  await ds.signIn("PT-001", "TestPass1!"); expect(await ds.fetchNotes()).toHaveLength(1);
});
it("deletes only the selected old recovery draft", async () => {
  await saveEditorDraft("master-default", null, n("new"));
  const own = (await listEditorDrafts("master-default", null))[0];
  const other = own.key.replace(/[^:]+$/, "other-tab"); localStorage.setItem(other, localStorage.getItem(own.key)!);
  await deleteEditorDraft("master-default", null, other);
  expect((await listEditorDrafts("master-default", null)).map(d => d.key)).toEqual([own.key]);
  await expect(deleteEditorDraft("master-default", null, "another-account:key")).rejects.toThrow();
});
it("copies all clinical fields independently and clears authorship and other-patient identity", () => {
  const note = n("source", { patientId: "original", assessment: "평가", plan: "계획", painScoreAfter: 3, createdBy: { uid: "old", id: null, role: "therapist", name: "원 작성자" }, rom: [{ joint: "shoulder", measuredROM: "90", normalRange: "180" }] });
  const same = copyNote(note);
  expect(same).toMatchObject({ patientId: "original", assessment: "평가", plan: "계획", painScoreAfter: 3, id: "", savedAt: "", createdBy: null });
  same.rom[0].joint = "changed"; expect(note.rom[0].joint).toBe("shoulder");
  const other = copyNote(note, true);
  expect(other.patientId).toBeUndefined(); expect(other.patientName).toBe(""); expect(other.painScoreAfter).toBeNull();
  expect(other.assessment).toBe("평가"); expect(other.plan).toBe("계획");
});

it("protects a recovery key overwritten by newer active edits", async () => {
  await saveEditorDraft("master-default", null, n("new", { treatment: "old" }));
  const old = (await listEditorDrafts("master-default", null))[0];
  await saveEditorDraft("master-default", null, n("new", { treatment: "current" }));
  await expect(deleteEditorDraft("master-default", null, old.key, old)).rejects.toThrow("새 입력");
  expect((await listEditorDrafts("master-default", null))[0].data.treatment).toBe("current");
});
it("splits conflicting imported patient IDs and preserves unknown staff for assignment", async () => {
  const a = await ds.upsertNote(n("local", { chartNo: "A" }));
  await ds.importCompatibleBackup(JSON.stringify({ notes: [n("imported", { chartNo: "B", patientId: a.patientId, therapistUid: "unknown-staff" })] }));
  const b = (await ds.fetchNotes()).find(x => x.id === "imported");
  expect(b?.patientId).not.toBe(a.patientId);
  expect((await ds.fetchTherapists()).find(t => t.uid === "unknown-staff")).toMatchObject({ importUnassigned: true, id: null });
});
