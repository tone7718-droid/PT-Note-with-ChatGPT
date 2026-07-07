"use client";

import { useMemo, useState } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, TrendingUp, X } from "lucide-react";

interface PatientTrendChartProps {
  patientId?: string;
  patientName: string;
  chartNo: string;
  onClose: () => void;
}

function formatShortDate(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function PatientTrendChart({ patientId, patientName, chartNo, onClose }: PatientTrendChartProps) {
  const notes = useNoteStore((s) => s.notes);
  const [activeTab, setActiveTab] = useState<"pain" | "rom">("pain");
  const [selectedJoint, setSelectedJoint] = useState("");

  const patientNotes = useMemo(() => {
    return notes
      .filter((note) => {
        if (patientId) return note.patientId === patientId;
        if (chartNo) return note.chartNo === chartNo;
        return note.patientName === patientName;
      })
      .sort((a, b) => new Date(a.noteDate || a.savedAt || 0).getTime() - new Date(b.noteDate || b.savedAt || 0).getTime());
  }, [notes, patientId, patientName, chartNo]);

  const painData = useMemo(() => {
    return patientNotes
      .filter((note) => note.painScore !== null && note.painScore !== undefined)
      .map((note) => ({
        date: formatShortDate(note.noteDate || note.savedAt || ""),
        score: note.painScore as number,
      }));
  }, [patientNotes]);

  const allJoints = useMemo(() => {
    const joints = new Set<string>();
    patientNotes.forEach((note) => {
      note.rom?.forEach((rom) => {
        if (rom.joint && rom.measuredROM) joints.add(rom.joint);
      });
    });
    return Array.from(joints).sort();
  }, [patientNotes]);

  const effectiveJoint = selectedJoint || allJoints[0] || "";

  const romData = useMemo(() => {
    if (!effectiveJoint) return [];
    return patientNotes
      .map((note) => {
        const rom = note.rom?.find((item) => item.joint === effectiveJoint);
        if (!rom?.measuredROM) return null;
        const value = parseFloat(rom.measuredROM);
        if (Number.isNaN(value)) return null;
        return {
          date: formatShortDate(note.noteDate || note.savedAt || ""),
          value,
        };
      })
      .filter(Boolean) as { date: string; value: number }[];
  }, [patientNotes, effectiveJoint]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <TrendingUp size={22} className="text-blue-600 dark:text-blue-400" />
              {patientName} 치료 추이
            </h2>
            {chartNo && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">차트번호: {chartNo}</p>}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">총 {patientNotes.length}건의 기록</p>
          </div>
          <button onClick={onClose} aria-label="추이 차트 닫기" className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-gray-500 dark:text-gray-400">
            <X size={22} />
          </button>
        </div>

        <div className="flex border-b border-gray-100 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("pain")}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === "pain"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            통증 점수 (NRS)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rom")}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === "rom"
                ? "text-green-600 dark:text-green-400 border-b-2 border-green-600 dark:border-green-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Activity size={14} className="inline mr-1" /> ROM 변화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "pain" ? (
            painData.length >= 2 ? (
              <div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={painData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-slate-700" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" />
                    <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" />
                    <Tooltip formatter={(value) => [`${value}/10`, "NRS 점수"]} />
                    <Legend />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ fill: "#3b82f6", strokeWidth: 2, r: 5 }} activeDot={{ r: 7, fill: "#2563eb" }} name="통증 점수" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500">
                <TrendingUp size={40} className="mb-3 opacity-30" />
                <p className="font-bold">통증 점수 기록이 2건 이상 필요합니다.</p>
                <p className="text-sm mt-1">현재 {painData.length}건</p>
              </div>
            )
          ) : (
            <div>
              {allJoints.length > 0 ? (
                <>
                  <select
                    value={effectiveJoint}
                    onChange={(event) => setSelectedJoint(event.target.value)}
                    className="w-full p-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 mb-4 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10"
                    aria-label="추이를 볼 관절 선택"
                  >
                    {allJoints.map((joint) => (
                      <option key={joint} value={joint}>{joint}</option>
                    ))}
                  </select>

                  {romData.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={romData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-slate-700" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" />
                        <YAxis tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" unit="°" />
                        <Tooltip formatter={(value) => [`${value}도`, effectiveJoint]} />
                        <Legend />
                        <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} dot={{ fill: "#22c55e", strokeWidth: 2, r: 5 }} activeDot={{ r: 7, fill: "#16a34a" }} name={effectiveJoint} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500">
                      <Activity size={40} className="mb-3 opacity-30" />
                      <p className="font-bold">선택한 관절의 측정 기록이 2건 이상 필요합니다.</p>
                      <p className="text-sm mt-1">현재 {romData.length}건</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500">
                  <Activity size={40} className="mb-3 opacity-30" />
                  <p className="font-bold">ROM 측정 기록이 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
