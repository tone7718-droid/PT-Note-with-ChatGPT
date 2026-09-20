import { EMPTY_NOTE, type NoteData } from "@/types";
import { currentActor, hospitalId } from "@/lib/accessControl";
import { encryptData, decryptData } from "@/lib/cryptoService";
import { withBrowserLock } from "@/lib/storageLock";
export interface EditorDraft { key: string; noteId: string | null; savedAt: string; data: NoteData; }
let tab: string | undefined;
let flush: (() => Promise<void>) | undefined;
let saved: (() => Promise<void>) | undefined;
const prefix = (uid: string, noteId: string | null) => `pt_editor_draft_v1:${hospitalId()}:${encodeURIComponent(uid)}:${encodeURIComponent(noteId ?? "new")}:`;
export function registerEditor(flushFn: () => Promise<void>, savedFn: () => Promise<void>): () => void {
  flush = flushFn; saved = savedFn;
  return () => { if (flush === flushFn) { flush = undefined; saved = undefined; } };
}
export async function flushEditor(): Promise<void> { await flush?.(); }
export async function markEditorSaved(): Promise<void> { await saved?.(); }
export async function saveEditorDraft(uid: string, noteId: string | null, data: NoteData): Promise<void> {
  if (currentActor().uid !== uid) throw new Error("임시 저장 계정이 변경되었습니다.");
  const key = prefix(uid, noteId) + (tab ??= crypto.randomUUID());
  await withBrowserLock("pt-note:draft:v2", async () => {
    const value: EditorDraft = { key, noteId, savedAt: new Date().toISOString(), data };
    const encrypted = await encryptData(JSON.stringify(value));
    if (currentActor().uid !== uid) throw new Error("임시 저장 계정이 변경되었습니다.");
    localStorage.setItem(key, encrypted);
  });
}
export async function listEditorDrafts(uid: string, noteId: string | null): Promise<EditorDraft[]> {
  if (currentActor().uid !== uid) throw new Error("임시 저장에 접근할 권한이 없습니다.");
  return withBrowserLock("pt-note:draft:v2", async () => {
    const entries: EditorDraft[] = [];
    for (const key of Object.keys(localStorage).filter(k => k.startsWith(prefix(uid, noteId)))) {
      try {
        const draft = JSON.parse(await decryptData(localStorage.getItem(key)!)) as EditorDraft;
        if (!draft || draft.noteId !== noteId || typeof draft.savedAt !== "string" || !draft.data || typeof draft.data.patientName !== "string") throw new Error();
        entries.push({ ...draft, key });
      } catch { throw new Error("임시 저장을 읽을 수 없습니다. 원본은 보존했습니다."); }
    }
    if (noteId === null && currentActor().role === "master") {
      const legacy = localStorage.getItem("pt_draft_note");
      if (legacy) {
        try {
          const old = JSON.parse(legacy.trimStart().startsWith("{") ? legacy : await decryptData(legacy));
          if (!old || typeof old.patientName !== "string" || typeof old.draftSavedAt !== "string") throw new Error();
          const { draftSavedAt, ...data } = old;
          entries.push({ key: "pt_draft_note", noteId: null, savedAt: draftSavedAt, data: { ...EMPTY_NOTE, id: "", savedAt: "", ...data } });
        } catch { throw new Error("구버전 임시 저장을 읽을 수 없습니다. 원본은 보존했습니다."); }
      }
    }
    return entries.sort((a,b) => b.savedAt.localeCompare(a.savedAt));
  });
}
export async function removeEditorDraft(uid: string, noteId: string | null, recoveredKey?: string): Promise<void> {
  if (currentActor().uid !== uid) throw new Error("임시 저장에 접근할 권한이 없습니다.");
  const base = prefix(uid, noteId);
  await withBrowserLock("pt-note:draft:v2", async () => {
    if (tab) localStorage.removeItem(base + tab);
    if (recoveredKey === "pt_draft_note" && noteId === null && currentActor().role === "master") localStorage.removeItem(recoveredKey);
    if (recoveredKey?.startsWith(base)) localStorage.removeItem(recoveredKey);
  });
}
