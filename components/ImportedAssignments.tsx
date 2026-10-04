"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNoteStore } from "@/store/useNoteStore";
export default function ImportedAssignments() {
  const accounts = useAuthStore(s => s.therapists);
  const actor = useAuthStore(s => s.therapist);
  const notes = useNoteStore(s => s.notes);
  const transfer = useNoteStore(s => s.transferNotes);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (actor?.role !== "master") return null;
  const unresolved = accounts.filter(t => t.importUnassigned && notes.some(n => (n.therapistUid || n.therapist?.uid) === t.uid));
  if (!unresolved.length) return null;
  return <section className="p-4 border rounded-xl bg-amber-50 text-gray-900">
    <h3 className="font-bold">가져온 기록의 미배정 치료사</h3>
    <p className="text-sm">로그인 ID만으로 기존 치료사와 합치지 않았습니다. 원본 담당자를 확인한 뒤 기록 전체를 배정하세요. 원 작성자와 변경 이력은 보존됩니다.</p>
    {unresolved.map(source => <div key={source.uid} className="flex flex-wrap items-center gap-2 mt-3">
      <span>{source.name} · {source.uid}</span>
      <select aria-label={`${source.name} 기록 배정 대상`} value={targets[source.uid] || ""} disabled={busy} onChange={e => setTargets({ ...targets, [source.uid]: e.target.value })}>
        <option value="">담당 치료사 선택</option>
        {accounts.filter(t => !t.resigned && !t.importUnassigned).map(t => <option key={t.uid} value={t.uid}>{t.name} ({t.id})</option>)}
      </select>
      <button type="button" disabled={busy || !targets[source.uid]} className="px-3 py-1 border rounded disabled:opacity-50" onClick={async () => {
        const target = accounts.find(t => t.uid === targets[source.uid]);
        if (!target || !window.confirm(`${source.name}의 가져온 기록 전체를 ${target.name}에게 배정하시겠습니까?`)) return;
        setBusy(true); setMessage("");
        try { await transfer(source.uid, target.uid, target.name, target.id); setMessage(`${target.name}에게 기록을 배정했습니다.`); }
        catch (err) { setMessage((err as Error).message); }
        finally { setBusy(false); }
      }}>기록 배정</button>
    </div>)}
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}
