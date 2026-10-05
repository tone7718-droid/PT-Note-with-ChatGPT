"use client";

import { useState } from "react";

/* ── 0~10단계 VAS 데이터 ── */
const scaleData = [
  { value: 0, label: "통증 없음", color: "#22c55e" },
  { value: 1, label: "아주 희미한 통증", color: "#4ade80" },
  { value: 2, label: "약간 아프다", color: "#84cc16" },
  { value: 3, label: "조금 더 아프다", color: "#a3e635" },
  { value: 4, label: "조금 아프다", color: "#eab308" },
  { value: 5, label: "불편한 통증", color: "#facc15" },
  { value: 6, label: "보통 아프다", color: "#f97316" },
  { value: 7, label: "상당히 아프다", color: "#fb923c" },
  { value: 8, label: "아주 아프다", color: "#ef4444" },
  { value: 9, label: "극심한 통증", color: "#f87171" },
  { value: 10, label: "참을 수 없다", color: "#dc2626" },
];

interface FaceScaleProps {
  value?: number | null;
  onChange?: (score: number) => void;
}

export default function FaceScale({ value: controlledValue, onChange }: FaceScaleProps) {
  const [internalValue, setInternalValue] = useState<number | null>(null);

  const selected = controlledValue !== undefined ? controlledValue : internalValue;

  const handleSelect = (score: number) => {
    if (onChange) {
      onChange(score);
    } else {
      setInternalValue(score);
    }
  };

  return (
    <div>
      <h3 className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-100 mb-3 sm:mb-8">
        통증 정도 (VAS 0~10)
      </h3>

      <div className="flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 sm:gap-2 max-w-4xl">
        {scaleData.map((item) => {
          const isSelected = selected === item.value;
          return (
            <div key={item.value} className="flex flex-col items-center gap-1 sm:gap-3">
              <button
                type="button"
                onClick={() => handleSelect(item.value)}
                className={`
                  relative flex items-center justify-center w-9 h-9 sm:w-14 sm:h-14 rounded-full text-base sm:text-2xl font-black
                  transition-all duration-300 ease-out cursor-pointer
                  focus:outline-none focus:ring-4 focus:ring-opacity-50
                  ${isSelected
                    ? "text-white shadow-xl scale-125 z-10"
                    : "bg-white text-gray-700 border-2 border-gray-200 hover:bg-gray-50 hover:scale-110 shadow-sm"
                  }
                `}
                style={isSelected ? { 
                  backgroundColor: item.color, 
                  borderColor: item.color,
                  boxShadow: `0 6px 16px ${item.color}66` 
                } : {}}
              >
                {item.value}
              </button>
            </div>
          );
        })}
      </div>

      {/* 선택된 값 요약 */}
      <div className="mt-3 sm:mt-10 h-10 flex items-center">
        {selected !== null && selected !== undefined ? (
          <div
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-base font-bold transition-all duration-300"
            style={{
              backgroundColor: `${scaleData.find(d => d.value === selected)?.color}15`,
              color: scaleData.find(d => d.value === selected)?.color,
              border: `2px solid ${scaleData.find(d => d.value === selected)?.color}44`,
            }}
          >
            선택된 통증 점수: {selected}점 — {scaleData.find(d => d.value === selected)?.label}
          </div>
        ) : (
          <div className="text-gray-400 italic text-sm">
            숫자를 클릭하여 통증 정도를 선택해주세요.
          </div>
        )}
      </div>
    </div>
  );
}
