"use client";

import { useEffect, useState } from "react";
import { X, Save, Sparkles } from "lucide-react";
import { loadMacros, saveMacros } from "@/lib/macros";

interface MacroManagementModalProps {
  onClose: () => void;
}

export default function MacroManagementModal({ onClose }: MacroManagementModalProps) {
  const [slots, setSlots] = useState<string[]>(() => loadMacros());
  const [savedFlash, setSavedFlash] = useState(false);

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setSlot = (idx: number, value: string) => {
    setSlots((cur) => {
      const next = [...cur];
      next[idx] = value;
      return next;
    });
  };

  const handleSave = () => {
    saveMacros(slots);
    // 다른 SmartTextarea 인스턴스에 알림
    window.dispatchEvent(new Event("pt-macros-updated"));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="px-4 py-3 sm:px-8 sm:py-6 border-b border-gray-100 flex items-center justify-between gap-2 bg-gray-50/50">
          <h2 className="text-sm sm:text-2xl font-black text-gray-900 flex items-center gap-2 min-w-0">
            <Sparkles className="text-blue-600 shrink-0" size={20} />
            <span className="truncate">매크로 관리 (/도수1~20)</span>
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {savedFlash && (
              <span className="text-green-600 text-xs sm:text-sm font-bold animate-in fade-in duration-200">
                ✓ 저장됨
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1 sm:gap-2 px-3 py-2 sm:px-5 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg sm:rounded-xl shadow-md transition-colors"
              aria-label="매크로 저장"
            >
              <Save size={14} /> 저장
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors" aria-label="모달 닫기">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 안내 */}
        <div className="px-6 sm:px-8 py-3 bg-blue-50/60 border-b border-blue-100 text-xs sm:text-sm text-blue-900 leading-relaxed">
          텍스트 입력창에 <span className="font-bold">/도수</span> 를 입력하면 등록된 문구 목록이 뜨고,{" "}
          <span className="font-bold">/도수3</span> 처럼 슬롯 번호까지 입력하면 해당 문구가 바로 자동 완성됩니다.
        </div>

        {/* 슬롯 리스트 */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 space-y-2">
          {slots.map((value, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="shrink-0 mt-2 px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-bold font-mono w-16 text-center">
                /도수{idx + 1}
              </span>
              <textarea
                value={value}
                onChange={(e) => setSlot(idx, e.target.value)}
                placeholder={`슬롯 ${idx + 1} — 자주 쓰는 도수치료 문구를 입력하세요`}
                rows={2}
                className="flex-1 min-w-0 p-2 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-y"
              />
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="px-4 sm:px-8 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/40">
          {savedFlash && (
            <span className="text-green-600 text-sm font-bold animate-in fade-in slide-in-from-right-2 duration-200">
              ✓ 저장됨
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-colors"
          >
            <Save size={16} /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}
