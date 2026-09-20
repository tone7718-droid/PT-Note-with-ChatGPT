"use client";
import { useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import type { NoteData } from "@/types";
import { useAuthStore } from "@/store/useAuthStore";
import { listEditorDrafts, saveEditorDraft, removeEditorDraft, registerEditor, type EditorDraft } from "@/lib/editorDraft";
export default function DraftRecoveryPanel({ noteId }: { noteId: string | null }) {
  const { watch, getValues, reset } = useFormContext<NoteData>();
  const uid = useAuthStore(s => s.therapist?.uid);
  const [drafts, setDrafts] = useState<EditorDraft[]>([]);
  const [error, setError] = useState("");
  const [at, setAt] = useState("");
  const recovered = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!uid) return;
    let active = true, ready = false, dirty = false;
    let written = "";
    let initial = "";
    // Parent form resets its selected record in a passive effect first.
    queueMicrotask(() => {
      if (!active) return;
      initial = JSON.stringify(getValues()); written = initial; ready = true;
      setError(""); setAt(""); recovered.current = undefined;
      void listEditorDrafts(uid, noteId).then(entries => { if (active) setDrafts(entries); }).catch((err: Error) => { if (active) setError(err.message); });
    });
    const subscription = watch(() => { if (ready) dirty = JSON.stringify(getValues()) !== initial; });
    const flush = async () => {
      if (!ready || !dirty) return;
      const data = structuredClone(getValues()); const json = JSON.stringify(data);
      if (json === written) return;
      try {
        await saveEditorDraft(uid, noteId, data);
        written = json;
        if (active) { setAt(new Date().toISOString()); setError(""); }
      } catch (err) { if (active) setError((err as Error).message); throw err; }
    };
    const unregister = registerEditor(flush, async () => {
      await removeEditorDraft(uid, noteId, recovered.current);
      initial = JSON.stringify(getValues()); written = initial; dirty = false;
      if (active) { setDrafts([]); setAt(""); setError(""); }
    });
    const timer = window.setInterval(() => { void flush().catch(() => {}); }, 5000);
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty && JSON.stringify(getValues()) !== written) { event.preventDefault(); event.returnValue = ""; }
    };
    const hidden = () => { if (document.visibilityState === "hidden") void flush().catch(() => {}); };
    window.addEventListener("beforeunload", unload); document.addEventListener("visibilitychange", hidden);
    return () => { active = false; subscription.unsubscribe(); unregister(); clearInterval(timer); window.removeEventListener("beforeunload", unload); document.removeEventListener("visibilitychange", hidden); };
  }, [uid, noteId, watch, getValues]);
  return <div className="print:hidden mx-auto max-w-5xl px-4 py-2 text-sm">
    <p role="status" className="text-gray-500">{at ? `임시 저장 완료 ${new Date(at).toLocaleTimeString()}` : "새 기록·수정 중 내용은 5초마다 임시 저장됩니다."} 기록 반영은 ‘저장’ 버튼을 눌러주세요.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {drafts.map(draft => <div key={draft.key} className="flex flex-wrap gap-2 items-center p-3 mt-2 bg-amber-50 dark:bg-amber-950 rounded-lg">
      <span>{new Date(draft.savedAt).toLocaleString()} {draft.key === "pt_draft_note" ? "구버전 작성자 미상 초안(관리자 확인 필요)" : "미저장 초안"}</span>
      <button type="button" className="px-2 py-1 border rounded" onClick={() => { recovered.current = draft.key; reset(draft.data); setDrafts([]); }}>초안 복구</button>
      <button type="button" className="px-2 py-1 border rounded" onClick={() => { if (uid) void removeEditorDraft(uid, noteId, draft.key).then(() => setDrafts(list => list.filter(d => d.key !== draft.key))).catch((err: Error) => setError(err.message)); }}>이 초안 삭제</button>
    </div>)}
  </div>;
}
