"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useNoteStore } from "@/store/useNoteStore";
import { romKey, romLabel, romSeries } from "@/lib/romMeasurement";
export default function PatientTrendChart({ patientId, patientName, chartNo, onClose }: { patientId?: string; patientName: string; chartNo: string; onClose: () => void }) {
  const notes = useNoteStore(s => s.notes);
  const [selected, setSelected] = useState("");
  const patient = useMemo(() => notes.filter(n => patientId ? n.patientId === patientId : chartNo ? n.chartNo === chartNo : false).sort((a,b) => (a.noteDate || a.savedAt || "").localeCompare(b.noteDate || b.savedAt || "")), [notes, patientId, chartNo]);
  const series = new Map(patient.flatMap(n => n.rom.filter(r => r.joint.trim()).map(r => [romKey(r), romLabel(r)] as const)));
  const key = series.has(selected) ? selected : series.keys().next().value ?? "";
  const rom = romSeries(patient, key);
  const pain = patient.map(n => ({ date: n.noteDate || n.savedAt, before: n.painScore ?? null, after: n.painScoreAfter ?? null }));
  return createPortal(<div className="fixed inset-0 z-[250] bg-black/50 p-4 flex items-center justify-center print:hidden">
    <section role="dialog" aria-modal="true" aria-labelledby="trend-title" className="w-full max-w-3xl max-h-[90vh] overflow-auto bg-white dark:bg-slate-900 rounded-2xl p-5">
      <div className="flex justify-between gap-3 mb-5"><h2 id="trend-title" className="text-xl font-bold">{patientName} 치료 추이</h2><button type="button" aria-label="추이 차트 닫기" onClick={onClose} className="p-2 border rounded-lg">닫기</button></div>
      {!patientId && !chartNo && <p role="alert">동명이인 혼동을 피하려면 먼저 환자 식별자 또는 차트번호가 필요합니다.</p>}
      <h3 className="font-bold mb-2">치료 전·후 통증 (NRS)</h3>
      <ResponsiveContainer width="100%" height={230}><LineChart data={pain}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0,10]} /><Tooltip /><Legend /><Line type="linear" dataKey="before" name="치료 전 NRS" stroke="#2563eb" connectNulls={false} /><Line type="linear" dataKey="after" name="치료 후 NRS" stroke="#16a34a" connectNulls={false} /></LineChart></ResponsiveContainer>
      <h3 className="font-bold mt-5 mb-2">ROM 시작각·끝각</h3>
      <label className="text-sm">측정 조건<select aria-label="ROM 측정 조건" value={key} onChange={e => setSelected(e.target.value)} className="block w-full p-2 border rounded-lg dark:bg-slate-800">{[...series].map(([id,label]) => <option key={id} value={id}>{label}</option>)}{!series.size && <option value="">ROM 기록 없음</option>}</select></label>
      <p className="my-2 text-xs text-gray-500">범위는 시작각과 끝각으로 표시합니다. 90/120처럼 뜻이 불명확한 값이나 같은 조건의 중복 측정은 그래프에서 제외합니다. 빈 구간은 측정값이 없음을 뜻합니다.</p>
      {rom.some(r => r.ambiguous) && <p role="status" className="text-amber-700 text-sm">해석 불가 또는 중복 조건으로 제외한 기록: {rom.filter(r => r.ambiguous).length}건</p>}
      <ResponsiveContainer width="100%" height={230}><LineChart data={rom}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis unit="°" /><Tooltip /><Legend /><Line type="linear" dataKey="start" name="시작각" stroke="#d97706" connectNulls={false} /><Line type="linear" dataKey="end" name="끝각" stroke="#2563eb" connectNulls={false} /></LineChart></ResponsiveContainer>
      <div className="overflow-x-auto"><table className="w-full text-xs text-left"><caption className="text-left font-bold mb-2">ROM 원본 측정 기록</caption><thead><tr><th>날짜</th><th>측정 조건</th><th>자유 입력 원문</th><th>구조화된 각도</th></tr></thead><tbody>{patient.flatMap(n => n.rom.map((r,i) => <tr key={`${n.id}-${i}`} className="border-t"><td className="py-2">{n.noteDate || n.savedAt}</td><td>{romLabel(r)}</td><td>{r.measuredROM || "—"}</td><td>{r.startAngle ?? "—"} ~ {r.endAngle ?? "—"}</td></tr>))}</tbody></table></div>
    </section>
  </div>, document.body);
}
