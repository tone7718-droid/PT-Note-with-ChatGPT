import * as React from "react";
import { useFormContext } from "react-hook-form";
import type { NoteData } from "@/types";
import { Card } from "@/components/ui/Card";
import { SmartTextarea } from "@/components/SmartTextarea";

const clinicalSections = [
  { num: "5", key: "postural",    title: "자세 분석 (Postural Observation)",     placeholder: "거북목, 골반 틀어짐 (Anterior Pelvic Tilt 등) 관찰 사항 기록..." },
  { num: "6", key: "palpation",   title: "촉진 (Palpation)",                     placeholder: "승모근 상부 압통(++), 요방형근 긴장도 증가 등 기록..." },
  { num: "7", key: "specialTest", title: "특수 검사 (Special Test)",              placeholder: "SLR Test (Right: 45°, Left: 70°), Neer Test (+) 등 검사 결과 기록..." },
  { num: "8", key: "treatment",   title: "치료 (Treatment)",                      placeholder: "도수치료(Manual Therapy) 30분, 견인치료, 온열치료 등 적용 사항..." },
  { num: "9", key: "assessment",  title: "평가 소견 (Assessment)",                placeholder: "치료 반응, 호전도, 임상적 판단 기록..." },
  { num: "10", key: "homeExercise",title: "홈 프로그램 (Home Exercise Program)",  placeholder: "환자에게 지도한 자가 운동 및 주의사항 기록..." },
  { num: "11", key: "plan",       title: "계획 (Plan)",                           placeholder: "다음 회차 치료 방향, 재평가 예정 항목 기록..." },
] as const;

export function ClinicalSections({ isGeneratingPdf }: { isGeneratingPdf: boolean }) {
  const { register, watch } = useFormContext<NoteData>();
  const painScoreAfter = watch("painScoreAfter");

  const sectionTitleCls = isGeneratingPdf
    ? "text-lg font-bold text-black border-b-2 border-gray-400 pb-1 mb-2 mt-4"
    : "text-base sm:text-2xl font-bold text-gray-900 border-b-2 border-gray-100 pb-2 sm:pb-3 mb-3 sm:mb-6 dark:text-slate-100 dark:border-slate-800 print:text-xl print:mb-3 print:pb-2 print:-mt-2 print:text-black";

  return (
    <>
      {clinicalSections.map((sec) => (
        <Card key={sec.num} isPdfMode={isGeneratingPdf}>
          <h2 className={sectionTitleCls}>{sec.num}. {sec.title}</h2>
          <label htmlFor={`clinical-${sec.key}`} className="sr-only">{sec.title}</label>
          <SmartTextarea
            id={`clinical-${sec.key}`}
            isPdfMode={isGeneratingPdf}
            scrollable
            placeholder={sec.placeholder}
            {...register(sec.key as keyof NoteData)}
          />
          {/* 치료 직후 통증 — 치료(8) 섹션 하단에 배치해 치료 전(painScore)과 비교 기록 */}
          {sec.key === "treatment" && (
            <div className={`flex items-center gap-3 ${isGeneratingPdf ? "mt-2" : "mt-3 sm:mt-4"}`}>
              <label
                htmlFor="pain-score-after"
                className={isGeneratingPdf
                  ? "text-sm font-bold text-black"
                  : "text-sm sm:text-base font-bold text-gray-700 dark:text-slate-200 print:text-black"}
              >
                치료 직후 통증 (NRS 0~10)
              </label>
              {isGeneratingPdf ? (
                <span className="text-base font-bold text-black border-b border-black px-3">
                  {typeof painScoreAfter === "number" ? painScoreAfter : "—"}
                </span>
              ) : (
                <input
                  id="pain-score-after"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  placeholder="—"
                  className="w-24 p-2.5 border-2 border-gray-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-500 font-bold text-lg text-center text-gray-800 dark:text-slate-100 bg-gray-50 dark:bg-slate-800 shadow-sm print:border-none print:shadow-none print:bg-transparent"
                  {...register("painScoreAfter", {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                    min: 0,
                    max: 10,
                  })}
                />
              )}
            </div>
          )}
        </Card>
      ))}
    </>
  );
}
