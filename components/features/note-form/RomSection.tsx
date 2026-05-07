"use client";

import React, { useState, useRef, useEffect } from "react";
import { useFormContext, useFieldArray, Controller } from "react-hook-form";
import type { NoteData } from "@/types";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/utils/cn";

/* ── 관절 정상 ROM 데이터베이스 (신용어 기반) ─────────────────────────
   참고: AAOS Normal Range of Motion chart
   용어: 대한해부학회 신용어 (굴곡→굽힘, 신전→폄, 외전→벌림, 내전→모음,
         내회전→안쪽 돌림, 외회전→가쪽 돌림, 회외→뒤침, 회내→엎침,
         배굴→발등굽힘, 저굴→발바닥쪽 굽힘, 내번→안쪽 들림, 외번→가쪽 들림,
         측굴→가쪽 굽힘, 고관절→엉덩관절, 전완→아래팔)
──────────────────────────────────────────────────────────────── */
const ROM_DATABASE: Record<string, string> = {
  // ── 목 (Cervical) ──
  "목 굽힘": "0~45°",
  "목 폄": "0~45°",
  "목 오른쪽 가쪽 굽힘": "0~45°",
  "목 왼쪽 가쪽 굽힘": "0~45°",
  "목 오른쪽 회전": "0~80°",
  "목 왼쪽 회전": "0~80°",

  // ── 허리 (Thoracolumbar) ──
  "허리 굽힘": "0~90°",
  "허리 폄": "0~30°",
  "허리 오른쪽 가쪽 굽힘": "0~30°",
  "허리 왼쪽 가쪽 굽힘": "0~30°",
  "허리 오른쪽 회전": "0~30°",
  "허리 왼쪽 회전": "0~30°",

  // ── 어깨 (Shoulder) ──
  "오른쪽 어깨 굽힘": "0~180°", "왼쪽 어깨 굽힘": "0~180°",
  "오른쪽 어깨 폄": "0~40°",    "왼쪽 어깨 폄": "0~40°",
  "오른쪽 어깨 벌림": "0~180°", "왼쪽 어깨 벌림": "0~180°",
  "오른쪽 어깨 모음": "0~30°",  "왼쪽 어깨 모음": "0~30°",
  "오른쪽 어깨 안쪽 돌림": "0~70°", "왼쪽 어깨 안쪽 돌림": "0~70°",
  "오른쪽 어깨 가쪽 돌림": "0~90°", "왼쪽 어깨 가쪽 돌림": "0~90°",

  // ── 엉덩관절 (Hip) ──
  "오른쪽 엉덩관절 굽힘": "0~100°", "왼쪽 엉덩관절 굽힘": "0~100°",
  "오른쪽 엉덩관절 폄": "0~30°",    "왼쪽 엉덩관절 폄": "0~30°",
  "오른쪽 엉덩관절 벌림": "0~40°",  "왼쪽 엉덩관절 벌림": "0~40°",
  "오른쪽 엉덩관절 모음": "0~20°",  "왼쪽 엉덩관절 모음": "0~20°",
  "오른쪽 엉덩관절 안쪽 돌림": "0~40°", "왼쪽 엉덩관절 안쪽 돌림": "0~40°",
  "오른쪽 엉덩관절 가쪽 돌림": "0~50°", "왼쪽 엉덩관절 가쪽 돌림": "0~50°",

  // ── 팔꿈치 (Elbow) ──
  "오른쪽 팔꿈치 굽힘": "0~150°", "왼쪽 팔꿈치 굽힘": "0~150°",
  "오른쪽 팔꿈치 폄": "0~0°",    "왼쪽 팔꿈치 폄": "0~0°",

  // ── 아래팔 (Forearm) ──
  "오른쪽 아래팔 엎침 (Pronation)": "0~80°",  "왼쪽 아래팔 엎침 (Pronation)": "0~80°",
  "오른쪽 아래팔 뒤침 (Supination)": "0~80°", "왼쪽 아래팔 뒤침 (Supination)": "0~80°",

  // ── 손목 (Wrist) ──
  "오른쪽 손목 굽힘": "0~70°", "왼쪽 손목 굽힘": "0~70°",
  "오른쪽 손목 폄": "0~60°",   "왼쪽 손목 폄": "0~60°",
  "오른쪽 손목 노쪽 치우침 (Radial deviation)": "0~20°", "왼쪽 손목 노쪽 치우침 (Radial deviation)": "0~20°",
  "오른쪽 손목 자쪽 치우침 (Ulnar deviation)": "0~30°",  "왼쪽 손목 자쪽 치우침 (Ulnar deviation)": "0~30°",

  // ── 무릎 (Knee) ──
  "오른쪽 무릎 굽힘": "0~150°", "왼쪽 무릎 굽힘": "0~150°",
  "오른쪽 무릎 폄": "0~0°",     "왼쪽 무릎 폄": "0~0°",

  // ── 발목 (Ankle) ──
  "오른쪽 발목 발등굽힘 (Dorsiflexion)": "0~20°",     "왼쪽 발목 발등굽힘 (Dorsiflexion)": "0~20°",
  "오른쪽 발목 발바닥쪽 굽힘 (Plantar flexion)": "0~40°", "왼쪽 발목 발바닥쪽 굽힘 (Plantar flexion)": "0~40°",
  "오른쪽 발목 안쪽 들림 (Inversion)": "0~20°", "왼쪽 발목 안쪽 들림 (Inversion)": "0~20°",
  "오른쪽 발목 가쪽 들림 (Eversion)": "0~30°",  "왼쪽 발목 가쪽 들림 (Eversion)": "0~30°",
};

const JOINT_NAMES = Object.keys(ROM_DATABASE);

export function RomSection({ isGeneratingPdf }: { isGeneratingPdf: boolean }) {
  const { control, watch, setValue } = useFormContext<NoteData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "rom",
  });
  
  // 감시용
  const romValues = watch("rom");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getFilteredJoints = (query: string) => {
    if (!query?.trim()) return [];
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");
    return JOINT_NAMES.filter((j) => j.toLowerCase().replace(/\s+/g, "").includes(normalizedQuery));
  };

  const getNormalRange = (joint: string): string | null => {
    return ROM_DATABASE[joint] ?? null;
  };

  const sectionTitleCls = isGeneratingPdf
    ? "text-lg font-bold text-black border-b-2 border-gray-400 pb-1 mb-2 mt-4"
    : "text-base sm:text-2xl font-bold text-gray-900 border-b-2 border-gray-100 pb-2 sm:pb-3 mb-3 sm:mb-6 dark:text-slate-100 dark:border-slate-800 print:text-xl print:mb-3 print:pb-2 print:-mt-2 print:text-black";

  return (
    <Card isPdfMode={isGeneratingPdf}>
      <h2 className={sectionTitleCls}>4. 관절 가동범위 (ROM &amp; Flexibility)</h2>

      <div className={cn("bg-white rounded-xl sm:rounded-2xl border-2 border-slate-100 p-3 sm:p-6 shadow-sm min-h-[180px] sm:min-h-[250px] dark:bg-slate-950/60 dark:border-slate-800 dark:shadow-none", isGeneratingPdf && "border-none shadow-none p-0 bg-white")}>
        <div className="hidden lg:grid lg:grid-cols-[1fr_1.5fr_48px] gap-6 mb-4 px-2">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider dark:text-slate-400">관절 동작 선택</span>
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider dark:text-slate-400">측정 ROM & 정상 범위</span>
          <span />
        </div>

        <div className="space-y-3 sm:space-y-5">
          {fields.map((field, index) => {
            const currentVal = romValues?.[index] || field;
            const suggestions = getFilteredJoints(currentVal.joint);
            const normalRange = getNormalRange(currentVal.joint);
            const showDropdown = activeId === field.id && suggestions.length > 0 && !isGeneratingPdf;
            const isSelected = !!normalRange;

            return (
              <div
                key={field.id}
                className={cn(
                  "grid grid-cols-1 gap-2 sm:gap-4 items-center p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all relative",
                  isGeneratingPdf ? "lg:grid-cols-[1fr_1.5fr] border-none p-2 border-b border-gray-200" : "lg:grid-cols-[1fr_1.5fr_48px]",
                  isSelected && !isGeneratingPdf ? "bg-blue-50/30 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/50" : "bg-gray-50/50 border-gray-100 dark:bg-slate-900/70 dark:border-slate-800",
                  isGeneratingPdf && "bg-transparent border-b-gray-300 rounded-none pb-2"
                )}
                style={{ zIndex: showDropdown ? 50 : 1 }}
              >
                {/* 1) 관절명 */}
                <div className="relative w-full" ref={activeId === field.id ? dropdownRef : undefined}>
                  <Controller
                    control={control}
                    name={`rom.${index}.joint`}
                    render={({ field: inputProps }) => (
                      <Input
                        {...inputProps}
                        isPdfMode={isGeneratingPdf}
                        className={cn(isSelected && !isGeneratingPdf ? "text-blue-900 font-bold bg-white dark:text-blue-100 dark:bg-slate-900" : "", "bg-gray-50/50")}
                        placeholder="예: 오른쪽 어깨..."
                        onFocus={() => { if (inputProps.value?.trim()) setActiveId(field.id); }}
                        onChange={(e) => {
                          // joint 값은 Controller가 담당. normalRange만 별도 업데이트
                          // (update()를 쓰면 field.id가 새로 생성되어 Input이 리마운트 → 포커스 손실)
                          inputProps.onChange(e);
                          setActiveId(field.id);
                          setHighlightIdx(-1);
                          setValue(
                            `rom.${index}.normalRange`,
                            getNormalRange(e.target.value) || "",
                            { shouldDirty: true }
                          );
                        }}
                        onKeyDown={(e) => {
                          if (!showDropdown) return;
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlightIdx((i) => Math.max(i - 1, 0));
                          } else if (e.key === "Enter" && highlightIdx >= 0) {
                            e.preventDefault();
                            const picked = suggestions[highlightIdx];
                            setValue(`rom.${index}.joint`, picked, { shouldDirty: true });
                            setValue(
                              `rom.${index}.normalRange`,
                              getNormalRange(picked) || "",
                              { shouldDirty: true }
                            );
                            setActiveId(null);
                          } else if (e.key === "Escape") {
                            setActiveId(null);
                          }
                        }}
                      />
                    )}
                  />

                  {showDropdown && (
                    <ul className="absolute top-[105%] left-0 w-full min-w-[240px] z-50 mt-1 max-h-[300px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl divide-y divide-gray-50 outline-none dark:bg-slate-900 dark:border-slate-700 dark:divide-slate-800">
                      {suggestions.map((s, idx) => (
                        <li
                          key={s}
                          className={`px-4 py-3.5 cursor-pointer text-base font-medium transition-colors flex items-center justify-between ${
                            idx === highlightIdx ? "bg-blue-600 text-white" : "hover:bg-blue-50 text-gray-800 dark:text-slate-100 dark:hover:bg-slate-800"
                          }`}
                          onMouseEnter={() => setHighlightIdx(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setValue(`rom.${index}.joint`, s, { shouldDirty: true });
                            setValue(
                              `rom.${index}.normalRange`,
                              ROM_DATABASE[s] || "",
                              { shouldDirty: true }
                            );
                            setActiveId(null);
                          }}
                        >
                          <span>{s}</span>
                          <span className={`text-sm tracking-wide font-bold ${idx === highlightIdx ? "text-blue-200" : "text-gray-400 dark:text-slate-500"}`}>
                            {ROM_DATABASE[s]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 2) 측정 ROM + 정상 범위 */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative min-w-[100px] sm:min-w-[140px] max-w-[160px] shrink-0">
                    <Controller
                      control={control}
                      name={`rom.${index}.measuredROM`}
                      render={({ field: inputProps }) => (
                        <Input
                          {...inputProps}
                          type="number"
                          isPdfMode={isGeneratingPdf}
                          min={0}
                          max={360}
                          className={cn(
                            "pr-6 sm:pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-center font-bold !text-base sm:!text-xl",
                            isSelected && !isGeneratingPdf ? "text-blue-700 bg-white ring-2 ring-blue-100 placeholder-blue-200 dark:bg-slate-900 dark:text-blue-100 dark:ring-blue-500/20 dark:placeholder-blue-900" : !isGeneratingPdf ? "bg-gray-100 text-gray-400 placeholder-gray-300 dark:bg-slate-800 dark:text-slate-400 dark:placeholder-slate-600" : ""
                          )}
                          placeholder="0"
                          disabled={!isSelected}
                        />
                      )}
                    />
                    <span className={`absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none text-base sm:text-lg ${isSelected ? 'text-blue-400' : 'text-gray-300 dark:text-slate-600'}`}>
                      °
                    </span>
                  </div>

                  <span className={`flex-1 text-xs sm:text-base font-bold whitespace-nowrap overflow-hidden text-ellipsis px-1 sm:px-2 ${isSelected ? "text-slate-600 dark:text-slate-300" : "text-gray-300 italic dark:text-slate-600"}`}>
                    {isSelected ? `/ 정상 : ${normalRange}` : "관절 선택 시 표시"}
                  </span>
                </div>

                {/* 4) 삭제 버튼 */}
                {!isGeneratingPdf && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="h-10 sm:h-[3.5rem] w-full lg:w-12 flex items-center justify-center rounded-lg sm:rounded-xl text-red-400 hover:text-red-700 hover:bg-red-50 transition-colors border-2 border-transparent hover:border-red-200 bg-white shadow-sm dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40 dark:hover:text-red-200 dark:hover:border-red-900"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!isGeneratingPdf && (
          <div className="mt-4 sm:mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => append({ joint: "", measuredROM: "", normalRange: "" })}
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-extrabold px-4 py-2.5 sm:px-8 sm:py-3.5 rounded-xl sm:rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-200 transition-all focus:ring-4 focus:ring-blue-500/20 active:scale-95 shadow-sm text-sm sm:text-base dark:text-blue-300 dark:hover:text-blue-200 dark:hover:bg-blue-950/40 dark:hover:border-blue-900"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              새로운 관절 측정 추가
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
