"use client";

import { useState, useMemo } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { X, TrendingUp, Activity } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

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
  const [selectedJoint, setSelectedJoint] = useState<string>("");

  // 같은 환자의 노트 수집 — patientId(내부 환자 식별자)를 우선 사용해
  // 동명이인이 섞이지 않게 한다.
  const patientNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (patientId) return n.patientId === patientId;
        if (chartNo) return n.chartNo === chartNo;
        return n.patientName === patientName;
      })
      .sort((a, b) => new Date(a.noteDate || a.savedAt || 0).getTime() - new Date(b.noteDate || b.savedAt || 0).getTime());
  }, [notes, patientId, patientName, chartNo]);

  // 통증 점수(NRS) 추이
  const painData = useMemo(() => {
    return patientNotes
      .filter((n) => n.painScore !== null && n.painScore !== undefined)
      .map((n) => ({
        date: formatShortDate(n.noteDate || n.savedAt || ""),
        score: n.painScore as number,
        fullDate: n.noteDate || n.savedAt || "",
      }));
  }, [patientNotes]);

  // 측정 기록이 있는 관절 목록
  const allJoints = useMemo(() => {
    const joints = new Set<string>();
    patientNotes.forEach((n) => {
      n.rom?.forEach((r) => {
        if (r.joint && r.measuredROM) joints.add(r.joint);
      });
    });
    return Array.from(joints).sort();
  }, [patientNotes]);

  // 선택된 관절 (미선택 시 첫 관절을 기본값으로 사용)
  const effectiveJoint = selectedJoint || allJoints[0] || "";

  // 선택 관절의 ROM 추이 (숫자가 아닌 측정값은 차트에서 제외)
  const romData = useMemo(() => {
    if (!effectiveJoint) return [];
    return patientNotes
      .map((n) => {
        const rom = n.rom?.find((r) => r.joint === effectiveJoint);
        if (!rom || !rom.measuredROM) return null;
        const value = parseFloat(rom.measuredROM);
        if (Number.isNaN(value)) return null;
        return {
          date: formatShortDate(n.noteDate || n.savedAt || ""),
          value,
          normalRange: rom.normalRange,
          fullDate: n.noteDate || n.savedAt || "",
        };
      })
      .filter(Boolean) as { date: string; value: number; normalRange: string; fullDate: string }[];
  }, [patientNotes, effectiveJoint]);

  return (
    <Modal layer="raised" size="lg">
        {/* Header */}
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

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-slate-700 shrink-0">
          <button
            onClick={() => setActiveTab("pain")}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === "pain"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            📊 통증 점수 (NRS)
          </button>
          <button
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

        {/* Chart Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "pain" ? (
            painData.length >= 2 ? (
              <div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={painData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-slate-700" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" />
                    <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-card, #fff)",
                        border: "1px solid var(--border-color, #e2e8f0)",
                        borderRadius: "12px",
                        fontSize: "13px",
                        fontWeight: "bold",
                        color: "inherit",
                      }}
                      itemStyle={{ color: "inherit" }}
                      formatter={(value) => [`${value}/10`, "NRS 점수"]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: "#3b82f6", strokeWidth: 2, r: 5 }}
                      activeDot={{ r: 7, fill: "#2563eb" }}
                      name="통증 점수"
                    />
                  </LineChart>
                </ResponsiveContainer>

                {/* Summary */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mb-1">첫 기록</p>
                    <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{painData[0]?.score}</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-green-600 dark:text-green-400 font-bold mb-1">최근 기록</p>
                    <p className="text-2xl font-black text-green-700 dark:text-green-300">{painData[painData.length - 1]?.score}</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mb-1">변화</p>
                    <p className={`text-2xl font-black ${(painData[painData.length - 1]?.score - painData[0]?.score) <= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                      {painData[painData.length - 1]?.score - painData[0]?.score > 0 ? "+" : ""}
                      {painData[painData.length - 1]?.score - painData[0]?.score}
                    </p>
                  </div>
                </div>
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
                  {/* Joint selector */}
                  <select
                    value={effectiveJoint}
                    onChange={(e) => setSelectedJoint(e.target.value)}
                    className="w-full p-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 mb-4 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10"
                    aria-label="추이를 볼 관절 선택"
                  >
                    {allJoints.map((j) => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </select>

                  {romData.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={romData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-slate-700" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" />
                        <YAxis tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-500 dark:text-gray-400" unit="°" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--bg-card, #fff)",
                            border: "1px solid var(--border-color, #e2e8f0)",
                            borderRadius: "12px",
                            fontSize: "13px",
                            fontWeight: "bold",
                            color: "inherit",
                          }}
                          itemStyle={{ color: "inherit" }}
                          formatter={(value) => [`${value}°`, effectiveJoint]}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#22c55e"
                          strokeWidth={3}
                          dot={{ fill: "#22c55e", strokeWidth: 2, r: 5 }}
                          activeDot={{ r: 7, fill: "#16a34a" }}
                          name={effectiveJoint}
                        />
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
    </Modal>
  );
}
