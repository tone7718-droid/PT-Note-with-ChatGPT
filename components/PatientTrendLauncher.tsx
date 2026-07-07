"use client";

import { useMemo, useState } from "react";
import { Activity, TrendingUp, X } from "lucide-react";
import { useNoteStore } from "@/store/useNoteStore";

type Point = { label: string; value: number; fullDate: string };

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function MiniLineChart({ points, min, max, unit }: { points: Point[]; min: number; max: number; unit: string }) {
  const width = 620;
  const height = 250;
  const padX = 42;
  const padY = 28;
  const range = Math.max(max - min, 1);
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padX + (index * (width - padX * 2)) / (points.length - 1);
    const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
    return { ...point, x, y };
  });
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[520px] h-auto" role="img" aria-label="치료 수치 추이 그래프">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padY + ratio * (height - padY * 2);
          const value = Math.round((max - ratio * range) * 10) / 10;
          return (
            <g key={ratio}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} className="stroke-gray-200 dark:stroke-slate-700" strokeDasharray="4 5" />
              <text x={padX - 8} y={y + 4} textAnchor="end" className="fill-gray-500 dark:fill-slate-400 text-[11px]">{value}{unit}</text>
            </g>
          );
        })}
        <polyline points={polyline} fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {coordinates.map((point) => (
          <g key={`${point.fullDate}-${point.value}`}>
            <circle cx={point.x} cy={point.y} r="6" className="fill-white dark:fill-slate-900 stroke-blue-600 dark:stroke-blue-400" strokeWidth="3" />
            <text x={point.x} y={height - 7} textAnchor="middle" className="fill-gray-500 dark:fill-slate-400 text-[11px]">{point.label}</text>
            <title>{`${point.fullDate}: ${point.value}${unit}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function PatientTrendLauncher() {
  const notes = useNoteStore((state) => state.notes);
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pain" | "rom">("pain");
  const [joint, setJoint] = useState("");

  const selected = useMemo(() => notes.find((note) => note.id === selectedNoteId), [notes, selectedNoteId]);

  const patientNotes = useMemo(() => {
    if (!selected) return [];
    return notes
      .filter((note) => {
        const selectedChart = selected.chartNo?.trim();
        if (selectedChart) return note.chartNo?.trim() === selectedChart;
        const sameName = note.patientName?.trim() === selected.patientName?.trim();
        const selectedBirth = selected.birthDate?.trim();
        return sameName && (!selectedBirth || note.birthDate?.trim() === selectedBirth);
      })
      .sort((a, b) => new Date(a.noteDate || a.savedAt).getTime() - new Date(b.noteDate || b.savedAt).getTime());
  }, [notes, selected]);

  const painPoints = useMemo<Point[]>(() => patientNotes
    .filter((note) => typeof note.painScore === "number")
    .map((note) => ({
      label: shortDate(note.noteDate || note.savedAt),
      value: note.painScore as number,
      fullDate: note.noteDate || note.savedAt,
    })), [patientNotes]);

  const joints = useMemo(() => {
    const found = new Set<string>();
    patientNotes.forEach((note) => note.rom?.forEach((entry) => {
      if (entry.joint?.trim() && entry.measuredROM?.trim() && Number.isFinite(Number.parseFloat(entry.measuredROM))) {
        found.add(entry.joint.trim());
      }
    }));
    return [...found].sort();
  }, [patientNotes]);

  const effectiveJoint = joint || joints[0] || "";
  const romPoints = useMemo<Point[]>(() => {
    if (!effectiveJoint) return [];
    return patientNotes.flatMap((note) => {
      const entry = note.rom?.find((item) => item.joint.trim() === effectiveJoint);
      const value = entry ? Number.parseFloat(entry.measuredROM) : Number.NaN;
      if (!Number.isFinite(value)) return [];
      return [{ label: shortDate(note.noteDate || note.savedAt), value, fullDate: note.noteDate || note.savedAt }];
    });
  }, [patientNotes, effectiveJoint]);

  if (!selected || patientNotes.length < 2) return null;

  const romValues = romPoints.map((point) => point.value);
  const romMin = romValues.length ? Math.floor(Math.min(...romValues) / 10) * 10 : 0;
  const romMax = romValues.length ? Math.ceil(Math.max(...romValues) / 10) * 10 || 10 : 10;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-16 sm:right-8 sm:top-8 z-30 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/95 px-4 py-2 text-sm font-extrabold text-blue-700 shadow-lg backdrop-blur hover:bg-blue-50 dark:border-blue-900 dark:bg-slate-900/95 dark:text-blue-300 dark:hover:bg-slate-800 print:hidden"
      >
        <TrendingUp size={17} /> 치료 추이
      </button>

      {open && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm print:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-gray-100 p-5 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-gray-900 dark:text-white"><TrendingUp className="text-blue-600" /> {selected.patientName} 치료 추이</h2>
                <p className="mt-1 text-xs font-bold text-gray-500 dark:text-slate-400">{selected.chartNo ? `차트번호 ${selected.chartNo} · ` : ""}총 {patientNotes.length}건</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"><X /></button>
            </div>

            <div className="flex border-b border-gray-100 dark:border-slate-800">
              <button type="button" onClick={() => setTab("pain")} className={`flex-1 py-3 text-sm font-extrabold ${tab === "pain" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>NRS 통증</button>
              <button type="button" onClick={() => setTab("rom")} className={`flex-1 py-3 text-sm font-extrabold ${tab === "rom" ? "border-b-2 border-emerald-600 text-emerald-600" : "text-gray-500"}`}><Activity size={15} className="mr-1 inline" />ROM</button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-7">
              {tab === "pain" ? (
                painPoints.length >= 2 ? (
                  <>
                    <MiniLineChart points={painPoints} min={0} max={10} unit="" />
                    <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/30"><p className="text-xs font-bold text-blue-600">첫 기록</p><p className="text-2xl font-black text-blue-800 dark:text-blue-200">{painPoints[0].value}</p></div>
                      <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30"><p className="text-xs font-bold text-emerald-600">최근</p><p className="text-2xl font-black text-emerald-800 dark:text-emerald-200">{painPoints.at(-1)?.value}</p></div>
                      <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30"><p className="text-xs font-bold text-amber-600">변화</p><p className="text-2xl font-black text-amber-800 dark:text-amber-200">{(painPoints.at(-1)?.value ?? 0) - painPoints[0].value > 0 ? "+" : ""}{(painPoints.at(-1)?.value ?? 0) - painPoints[0].value}</p></div>
                    </div>
                  </>
                ) : <p className="py-16 text-center font-bold text-gray-400">NRS 기록이 2건 이상 필요합니다.</p>
              ) : joints.length ? (
                <>
                  <select value={effectiveJoint} onChange={(event) => setJoint(event.target.value)} className="mb-5 w-full rounded-xl border-2 border-gray-200 bg-white p-3 font-bold dark:border-slate-700 dark:bg-slate-950">
                    {joints.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  {romPoints.length >= 2 ? <MiniLineChart points={romPoints} min={romMin} max={romMax} unit="°" /> : <p className="py-16 text-center font-bold text-gray-400">선택한 관절의 숫자형 ROM 기록이 2건 이상 필요합니다.</p>}
                </>
              ) : <p className="py-16 text-center font-bold text-gray-400">숫자로 입력된 ROM 기록이 없습니다.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
