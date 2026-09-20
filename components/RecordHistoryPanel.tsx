"use client";
import { useState } from "react";
import { fetchRecordHistory } from "@/lib/localDataService";
import type { HistoryEntry } from "@/lib/recordHistory";
import { useNoteStore } from "@/store/useNoteStore";
const actions: Record<string, string> = { upsertNote: "저장", transferNotesRpc: "담당자 이관", delete: "삭제", restoreAutoBackup: "백업 복원", restoreNoteSnapshot: "백업 복원", importCompatibleBackup: "백업 가져오기", importNotes: "기록 가져오기" };
const fields: Record<string,string> = { patientName:"환자명", diagnosis:"진단명", treatment:"치료 내용", chiefComplaint:"주호소", rom:"ROM", painScore:"치료 전 NRS", painScoreAfter:"치료 후 NRS", assessment:"평가", plan:"계획", homeExercise:"자가 운동", therapistUid:"현재 담당자 ID", therapist:"현재 담당자", savedAt:"저장 시각", patientId:"환자 ID", chartNo:"차트번호", birthDate:"생년월일", pmh:"과거력", postural:"자세", palpation:"촉진", specialTest:"특수검사", noteDate:"작성일" };
export default function RecordHistoryPanel({ noteId }: { noteId: string | null }) {
  const note = useNoteStore(s => s.notes.find(n => n.id === noteId));
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  if (!noteId) return null;
  return <section className="print:hidden max-w-5xl mx-auto px-4 py-3 text-sm">
    <p>최초 작성자: {note?.createdBy?.name || "확인 불가(기존 기록)"} · 현재 담당자: {note?.therapist?.name || "미지정"}</p>
    <p>마지막 수정: {note?.updatedBy?.name || "확인 불가"} {note?.updatedAt ? new Date(note.updatedAt).toLocaleString() : ""}</p>
    <button type="button" className="my-2 px-3 py-2 border rounded-lg" onClick={() => { setError(""); void fetchRecordHistory(noteId).then(setEntries).catch((err: Error) => setError(err.message)); }}>수정 이력 조회</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {entries && <div className="max-h-80 overflow-auto">{!entries.length && <p>이력 기능 적용 이전의 변경은 확인할 수 없습니다.</p>}{[...entries].reverse().map(entry => <details key={entry.id} className="border-t py-2"><summary className="cursor-pointer">{new Date(entry.at).toLocaleString()} · {entry.actor.name}{entry.source ? " (백업에서 가져온 이력·작성자 미검증)" : ""} · {actions[entry.action] || entry.action}</summary>{Object.entries(entry.changes).filter(([field]) => !["hospitalId","createdBy","createdAt","updatedBy","updatedAt"].includes(field)).map(([field, change]) => <div key={field} className="p-2"><b>{fields[field] || field}</b><div className="grid grid-cols-2 gap-2"><pre className="whitespace-pre-wrap break-all text-xs">이전: {typeof change.before === "string" ? change.before : JSON.stringify(change.before)}</pre><pre className="whitespace-pre-wrap break-all text-xs">이후: {typeof change.after === "string" ? change.after : JSON.stringify(change.after)}</pre></div></div>)}</details>)}</div>}
  </section>;
}
