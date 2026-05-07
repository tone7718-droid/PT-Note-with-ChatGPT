import * as React from "react";
import { useFormContext } from "react-hook-form";
import type { NoteData } from "@/types";
import { Card } from "@/components/ui/Card";
import { SmartTextarea } from "@/components/SmartTextarea";

export function ComplaintSection({ isGeneratingPdf }: { isGeneratingPdf: boolean }) {
  const { register } = useFormContext<NoteData>();

  const sectionTitleCls = isGeneratingPdf
    ? "text-lg font-bold text-black border-b-2 border-gray-400 pb-1 mb-2 mt-4"
    : "text-base sm:text-2xl font-bold text-gray-900 border-b-2 border-gray-100 pb-2 sm:pb-3 mb-3 sm:mb-6 print:text-xl print:mb-3 print:pb-2 print:-mt-2";

  return (
    <Card isPdfMode={isGeneratingPdf}>
      <h2 className={sectionTitleCls}>2. 주호소 및 발병 시기 (Chief Complaint &amp; Onset)</h2>
      <label htmlFor="chiefComplaint" className="sr-only">주호소 및 발병 시기</label>
      <SmartTextarea
        id="chiefComplaint"
        isPdfMode={isGeneratingPdf}
        scrollable
        placeholder="증상 및 발생 시기 입력..."
        {...register("chiefComplaint")}
      />
    </Card>
  );
}
