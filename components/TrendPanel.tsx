"use client";

import { useMemo, useState } from "react";
import { Activity, TrendingUp, X } from "lucide-react";
import { useNoteStore } from "@/store/useNoteStore";

type Point = { date: string; value: number };

function labelDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function LinePlot({ data, min, max, unit = "" }: { data: Point[]; min: number; max: number; unit?: string }) {
  const width = 600;
  const height = 240;
  const pad = 36;
  const range = Math.max(max - min, 1);
  const points = data.map((item, index) => ({
    ...item,
    x: data.length === 1 ? width / 2 : pad + index * (width - pad * 2) / (data.length - 1),
    y: height - pad - (item.value - min) / range * (height - pad * 2),
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[500px]" role="img" aria-label="수치 변화 그래프">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = pad + ratio * (height - pad * 2);
        const value = Math.round((max - ratio * range) * 10) / 10;
        return <g key={ratio}><line x1={pad} x2={width - pad} y1={y} y2={y} stroke="currentColor" className="text-gray-200 dark:text-slate-700" strokeDasharray="4 5" /><text x={pad - 7} y={y + 4} textAnchor="end" className="fill-gray-500 text-[11px]">{value}{unit}</text></g>;
      })}
      <polyline points={points.map((item) => `${item.x},${item.y}`).join(" ")} fill="none" stroke="currentColor" className="text-blue-600 dark:text-blue-400" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((item, index) => <g key={`${item.date}-${index}`}><circle cx={item.x} cy={item.y} r="6" fill="white" stroke="currentColor" className="text-blue-600 dark:text-blue-400" strokeWidth="3" /><text x={item.x} y={height - 8} textAnchor="middle" className="fill-gray-500 text-[11px]">{item.date}</text><title>{item.value}{unit}</title></g>)}
    </svg>
  );
}

export default function TrendPanel() {
  const notes = useNoteStore((state) => state.notes);
  const selectedId = useNoteStore((state) => state.selectedNoteId);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pain" | "rom">("pain");
  const [joint, setJoint] = useState("");

  const selected = useMemo(() => notes.find((note) => note.id === selectedId), [notes, selectedId]);
  const records = useMemo(() => {
    if (!selected) return [];
    return notes.filter((note) => {
      if (selected.chartNo?.trim()) return note.chartNo?.trim() === selected.chartNo.trim();
      return note.patientName?.trim() === selected.patientName?.trim() && (!selected.birthDate?.trim() || note.birthDate?.trim() === selected.birthDate.trim());
    }).sort((a, b) => new Date(a.noteDate || a.savedAt).getTime() - new Date(b.noteDate || b.savedAt).getTime());
  }, [notes, selected]);

  const pain = useMemo(() => records.flatMap((note) => typeof note.painScore === "number" ? [{ date: labelDate(note.noteDate || note.savedAt), value: note.painScore }] : []), [records]);
  const joints = useMemo(() => [...new Set(records.flatMap((note) => note.rom?.filter((item) => Number.isFinite(Number.parseFloat(item.measuredROM))).map((item) => item.joint.trim()).filter(Boolean) || []))].sort(), [records]);
  const activeJoint = joint || joints[0] || "";
  const rom = useMemo(() => records.flatMap((note) => {
    const item = note.rom?.find((entry) => entry.joint.trim() === activeJoint);
    const value = item ? Number.parseFloat(item.measuredROM) : Number.NaN;
    return Number.isFinite(value) ? [{ date: labelDate(note.noteDate || note.savedAt), value }] : [];
  }), [records, activeJoint]);

  if (!selected || records.length < 2) return null;
  const romValues = rom.map((item) => item.value);
  const romMin = romValues.length ? Math.floor(Math.min(...romValues) / 10) * 10 : 0;
  const romMax = romValues.length ? Math.max(romMin + 10, Math.ceil(Math.max(...romValues) / 10) * 10) : 10;

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed right-4 top-16 sm:right-8 sm:top-8 z-30 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/95 px-4 py-2 text-sm font-extrabold text-blue-700 shadow-lg backdrop-blur hover:bg-blue-50 dark:border-blue-900 dark:bg-slate-900/95 dark:text-blue-300 print:hidden"><TrendingUp size={17} />치료 추이</button>
    {open && <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm print:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-slate-800"><div><h2 className="flex items-center gap-2 text-xl font-black"><TrendingUp className="text-blue-600" />{selected.patientName} 치료 추이</h2><p className="mt-1 text-xs font-bold text-gray-500">총 {records.length}건</p></div><button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-slate-800"><X /></button></div>
        <div className="flex border-b border-gray-100 dark:border-slate-800"><button type="button" onClick={() => setTab("pain")} className={`flex-1 py-3 font-extrabold ${tab === "pain" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>NRS</button><button type="button" onClick={() => setTab("rom")} className={`flex-1 py-3 font-extrabold ${tab === "rom" ? "border-b-2 border-emerald-600 text-emerald-600" : "text-gray-500"}`}><Activity size={15} className="mr-1 inline" />ROM</button></div>
        <div className="overflow-auto p-5 sm:p-7">{tab === "pain" ? pain.length >= 2 ? <LinePlot data={pain} min={0} max={10} /> : <p className="py-16 text-center font-bold text-gray-400">NRS 기록이 2건 이상 필요합니다.</p> : joints.length ? <><select value={activeJoint} onChange={(event) => setJoint(event.target.value)} className="mb-5 w-full rounded-xl border-2 border-gray-200 bg-white p-3 font-bold dark:border-slate-700 dark:bg-slate-950">{joints.map((name) => <option key={name}>{name}</option>)}</select>{rom.length >= 2 ? <LinePlot data={rom} min={romMin} max={romMax} unit="°" /> : <p className="py-16 text-center font-bold text-gray-400">선택한 관절의 기록이 2건 이상 필요합니다.</p>}</> : <p className="py-16 text-center font-bold text-gray-400">숫자형 ROM 기록이 없습니다.</p>}</div>
      </div>
    </div>}
  </>;
}
