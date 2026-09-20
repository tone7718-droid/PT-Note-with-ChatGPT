"use client";
import { useFormContext } from "react-hook-form";
import type { NoteData } from "@/types";
export function RomDetails({ index, isPdf }: { index: number; isPdf: boolean }) {
  const { register, watch } = useFormContext<NoteData>();
  const row = watch(`rom.${index}`);
  if (isPdf) return <p className="col-span-full text-xs">{[row.movement, row.side === "left" ? "좌" : row.side === "right" ? "우" : row.side === "both" ? "양측" : "", row.mode, row.startAngle != null || row.endAngle != null ? `${row.startAngle ?? "미측정"}° ~ ${row.endAngle ?? "미측정"}°` : ""].filter(Boolean).join(" · ")}</p>;
  const cls = "block w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-sm";
  return <div className="col-span-full grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
    <label>운동 방향<input aria-label={`ROM ${index + 1} 운동 방향`} placeholder="예: 굽힘" className={cls} {...register(`rom.${index}.movement`)} /></label>
    <label>좌우<select aria-label={`ROM ${index + 1} 좌우`} className={cls} {...register(`rom.${index}.side`)}><option value="">미지정</option><option value="left">좌</option><option value="right">우</option><option value="both">양측</option></select></label>
    <label>측정 방식<select aria-label={`ROM ${index + 1} 측정 방식`} className={cls} {...register(`rom.${index}.mode`)}><option value="">미지정</option><option value="AROM">AROM</option><option value="PROM">PROM</option></select></label>
    <label>시작각(°)<input aria-label={`ROM ${index + 1} 시작각`} type="number" step="any" min={-360} max={360} className={cls} {...register(`rom.${index}.startAngle`, { setValueAs: v => v === "" ? null : Number(v) })} /></label>
    <label>끝각(°)<input aria-label={`ROM ${index + 1} 끝각`} type="number" step="any" min={-360} max={360} className={cls} {...register(`rom.${index}.endAngle`, { setValueAs: v => v === "" ? null : Number(v) })} /></label>
    <p className="col-span-full text-gray-500">자유 입력 원문은 그대로 보관합니다. 각도를 별도로 입력하면 그래프는 해당 각도를 사용합니다.</p>
  </div>;
}
