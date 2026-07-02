"use client";

import { useState, useRef, useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { useNoteStore } from "@/store/useNoteStore";
import { useAuthStore } from "@/store/useAuthStore";
import { EMPTY_NOTE, type NoteData, type Therapist } from "@/types";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { Save, X as XIcon, Clock, Copy } from "lucide-react";
import { loadDraft, saveDraft, clearDraft, isNoteContentful, formatRelativeTime, type DraftNoteData } from "@/lib/draftNote";
import { formatLastDraftSaveLabel, getPdfPageSlices } from "@/lib/progressNoteUi";

import { PatientInfoSection } from "./features/note-form/PatientInfoSection";
import { ComplaintSection } from "./features/note-form/ComplaintSection";
import { BodyDiagramSection } from "./features/note-form/BodyDiagramSection";
import { RomSection } from "./features/note-form/RomSection";
import { ClinicalSections } from "./features/note-form/ClinicalSections";

export default function ProgressNoteForm() {
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  const notes = useNoteStore((s) => s.notes);
  const saveNote = useNoteStore((s) => s.saveNote);
  const selectNote = useNoteStore((s) => s.selectNote);
  const therapist = useAuthStore((s) => s.therapist);

  const methods = useForm<NoteData>({
    defaultValues: EMPTY_NOTE,
  });

  const { handleSubmit, reset, watch } = methods;

  const [showSaved, setShowSaved] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [savedTherapist, setSavedTherapist] = useState<Therapist | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);

  // 자동 임시 저장
  const [pendingDraft, setPendingDraft] = useState<DraftNoteData | null>(null);
  const [autoSaveFlash, setAutoSaveFlash] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<Date | null>(null);

  // 노트 복사 (이 노트를 베이스로 새 노트 시작)
  const pendingCopyRef = useRef<NoteData | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const outputMenuRef = useRef<HTMLDivElement>(null);

  // notes 는 ref 로 참조 — notes 배열 갱신(삭제·이관 등)이
  // 작성 중인 폼을 리셋시키지 않도록 로드 effect 의존성에서 제외
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // formState.isDirty 는 렌더 중에 읽어야 프록시 구독이 활성화됨
  const { isDirty } = methods.formState;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // 출력 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!outputMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (outputMenuRef.current && !outputMenuRef.current.contains(e.target as Node)) {
        setOutputMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [outputMenuOpen]);

  // 현재 값 구독 (하단 서명 및 토스트용)
  const patientName = watch("patientName");
  const noteDate = watch("noteDate");

  // selectedNoteId 변경 시 폼 데이터 로드 또는 리셋
  useEffect(() => {
    if (selectedNoteId === null) {
      // [복사 모드] — 이 노트 복사하여 새 노트 시작 으로 진입한 경우
      if (pendingCopyRef.current) {
        const src = pendingCopyRef.current;
        pendingCopyRef.current = null;
        const roms = src.rom && src.rom.length > 0 ? src.rom : [{ joint: "", measuredROM: "", normalRange: "" }];
        reset({ ...src, rom: roms });
        setCurrentNoteId(null);
        setSavedTherapist(null);
        setPendingDraft(null); // 복구 배너 숨김 — 방금 복사 데이터로 채웠으니 draft 와 무관
        setLastDraftSavedAt(null);
        return;
      }
      // [일반 새 노트 모드]
      reset({ ...EMPTY_NOTE, noteDate: new Date().toISOString().split("T")[0], rom: [{ joint: "", measuredROM: "", normalRange: "" }] });
      setCurrentNoteId(null);
      setSavedTherapist(null);
      // 임시 저장된 draft 가 있으면 복구 배너 표시
      const d = loadDraft();
      if (d && isNoteContentful(d)) {
        setPendingDraft(d);
        setLastDraftSavedAt(new Date(d.draftSavedAt));
      } else {
        setPendingDraft(null);
        setLastDraftSavedAt(null);
      }
      return;
    }
    // 기존 노트 편집 모드 → draft 배너 숨김
    setPendingDraft(null);
    setLastDraftSavedAt(null);
    const note = notesRef.current.find((n) => n.id === selectedNoteId);
    if (note) {
      const roms = note.rom && note.rom.length > 0 ? note.rom : [{ joint: "", measuredROM: "", normalRange: "" }];
      reset({ ...note, rom: roms });
      setCurrentNoteId(note.id ?? null);
      setSavedTherapist(note.therapist ?? null);
    }
  }, [selectedNoteId, reset]);

  /* ── 자동 임시 저장 (5초 주기) ──
     새 노트 작성 모드에서만 작동. 빈 폼은 저장 안 함.
     사용자가 직접 수정하기 전(isDirty=false)에는 저장하지 않음 —
     노트 복사 직후 등에 기존 draft 를 덮어쓰지 않기 위함.
     [저장] 성공 시 clearDraft() 로 정리됨. */
  useEffect(() => {
    if (currentNoteId !== null) return; // 기존 노트 수정 중은 제외
    const interval = window.setInterval(() => {
      if (!isDirtyRef.current) return;
      const data = methods.getValues();
      if (!isNoteContentful(data)) return;
      const savedAt = new Date();
      saveDraft(data);
      setLastDraftSavedAt(savedAt);
      setAutoSaveFlash(true);
      window.setTimeout(() => setAutoSaveFlash(false), 1200);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [currentNoteId, methods]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    const { draftSavedAt: _omit, ...data } = pendingDraft;
    void _omit;
    const roms = data.rom && data.rom.length > 0 ? data.rom : [{ joint: "", measuredROM: "", normalRange: "" }];
    reset({ ...EMPTY_NOTE, ...data, rom: roms });
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearDraft();
    setPendingDraft(null);
    setLastDraftSavedAt(null);
  };

  /* 현재 보고 있는 기존 노트를 베이스로 새 노트 시작 */
  const handleCopyToNewNote = () => {
    const current = methods.getValues();
    pendingCopyRef.current = {
      ...current,
      id: "",
      savedAt: "",
      noteDate: new Date().toISOString().split("T")[0],
      therapist: therapist || null,
      therapistUid: therapist?.uid || "",
    };
    selectNote(null); // 새 노트 모드 진입 → useEffect 가 pendingCopyRef 감지하고 복사 데이터로 reset
    setCopyFlash(true);
    setTimeout(() => setCopyFlash(false), 3000);
  };

  // 저장 로직
  const onSaveSubmit = async (data: NoteData) => {
    const errors: string[] = [];
    if (!data.patientName?.trim()) errors.push("환자 성명");
    if (!data.diagnosis?.trim()) errors.push("진단명");

    if (errors.length > 0) {
      setValidationErrors(errors);
      setTimeout(() => setValidationErrors([]), 4000);
      return;
    }
    setValidationErrors([]);

    const effectiveNoteDate = data.noteDate || new Date().toISOString().split("T")[0];
    data.noteDate = effectiveNoteDate;
    
    // rom 빈 값 제거
    data.rom = data.rom?.filter(r => r.joint.trim() !== "") || [];

    const formData = {
      ...data,
      therapist: therapist || savedTherapist,
      therapistUid: therapist?.uid || savedTherapist?.uid || "",
    };

    setIsSaving(true);
    try {
      const saved = await saveNote(formData, currentNoteId);
      setCurrentNoteId(saved.id);
      setShowSaved(true);
      // 정상 저장 → 임시 저장 정리
      clearDraft();
      setPendingDraft(null);
      setLastDraftSavedAt(null);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (err) {
      console.error("저장 실패:", err);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const onInvalid = (errors: Record<string, unknown>) => {
    const errorList: string[] = [];
    if (errors.patientName) errorList.push("환자 성명");
    if (errors.diagnosis) errorList.push("진단명");
    setValidationErrors(errorList);
    setTimeout(() => setValidationErrors([]), 4000);
  };

  const handleDownloadPDF = async () => {
    if (!containerRef.current) return;
    setIsGeneratingPdf(true);

    setTimeout(async () => {
      try {
        const target = containerRef.current!;
        const canvas = await html2canvas(target, {
          scale: 1.5,
          useCORS: true,
          windowWidth: 800,
          windowHeight: target.scrollHeight,
          width: target.scrollWidth,
          height: target.scrollHeight,
          scrollX: 0,
          scrollY: 0,
          backgroundColor: "#ffffff",
        });

        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();   // 210mm
        const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
        const slices = getPdfPageSlices({
          canvasWidthPx: canvas.width,
          canvasHeightPx: canvas.height,
          pageWidthMm: pageWidth,
          pageHeightMm: pageHeight,
        });

        slices.forEach((slice, index) => {
          if (index > 0) pdf.addPage();
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = slice.sourceHeight;
          const ctx = pageCanvas.getContext("2d");
          if (!ctx) throw new Error("PDF 페이지 캔버스를 생성할 수 없습니다.");
          ctx.drawImage(
            canvas,
            0,
            slice.sourceY,
            canvas.width,
            slice.sourceHeight,
            0,
            0,
            canvas.width,
            slice.sourceHeight
          );
          const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.85);
          pdf.addImage(pageImgData, "JPEG", 0, 0, pageWidth, slice.pageImageHeightMm);
        });

        const dateStr = noteDate ? noteDate.replace(/-/g, "") : "날짜없음";
        const nameStr = patientName || "이름없음";
        const fileName = `환자평가지_${nameStr}_${dateStr}.pdf`;

        pdf.save(fileName);
      } catch (error) {
        console.error("PDF 생성 실패:", error);
        alert("PDF 생성에 실패했습니다.");
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 150);
  };

  const displayTherapist = currentNoteId ? savedTherapist : therapist;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSaveSubmit, onInvalid)}>
        <div 
          className={isGeneratingPdf
            ? "bg-white p-0 m-0 text-black w-[800px] overflow-visible"
            : "max-w-5xl mx-auto px-3 sm:px-10 py-5 sm:py-10 bg-gray-50/30 min-h-full pb-32 sm:pb-48 scroll-smooth dark:bg-slate-950 print:bg-white print:p-0 print:m-0 print:pb-0"
          }
        >
          <div ref={containerRef} className={isGeneratingPdf ? "bg-white px-8 py-10" : "w-full h-full"}>
            
            {/* 타이틀 & 버튼 */}
            <div className={`relative pb-3 sm:pb-6 border-b-2 ${isGeneratingPdf ? 'border-gray-800 mb-6' : 'border-gray-200 mb-5 sm:mb-10 dark:border-slate-800 print:border-transparent print:mb-6 print:pb-2'}`}>
              <h1 className={`font-extrabold text-center tracking-tight ${isGeneratingPdf ? 'text-3xl text-black' : 'text-xl sm:text-4xl text-gray-900 dark:text-white print:text-3xl print:text-left print:border-b-4 print:border-gray-800 print:pb-4 print:text-black'}`}>
                물리치료 환자 평가지
              </h1>
              
              <div ref={outputMenuRef} className={`absolute right-0 top-1/2 -translate-y-1/2 ${isGeneratingPdf ? 'hidden' : 'hidden sm:block print:hidden'}`}>
                <button
                  type="button"
                  onClick={() => setOutputMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={outputMenuOpen}
                  aria-label="출력 옵션 열기"
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md hover:shadow-xl transition-all dark:shadow-none"
                >
                  📄 출력
                  <span className={`text-xs transition-transform ${outputMenuOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {outputMenuOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-150 dark:bg-slate-900 dark:border-slate-700">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOutputMenuOpen(false); handleDownloadPDF(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-blue-50 font-bold transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span>📄</span> PDF로 저장
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOutputMenuOpen(false); window.print(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-blue-50 font-bold border-t border-gray-100 transition-colors dark:text-slate-200 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <span>🖨️</span> 인쇄
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className={`mb-3 sm:mb-6 flex flex-col gap-2 ${isGeneratingPdf ? 'hidden' : 'print:hidden'}`}>
              {/* 임시 저장 복구 배너 — 새 노트 모드에서 이전 작성 내용이 있을 때 */}
              {pendingDraft && !currentNoteId && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 bg-amber-50 border-2 border-amber-200 rounded-xl shadow-sm dark:bg-amber-950/30 dark:border-amber-900/60">
                  <Clock size={16} className="text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-100">이전에 작성하던 내용이 있어요</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">자동 임시 저장됨 · {formatRelativeTime(pendingDraft.draftSavedAt)}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={restoreDraft}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                    >
                      <Save size={14} /> 불러오기
                    </button>
                    <button
                      type="button"
                      onClick={discardDraft}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs sm:text-sm font-bold text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                      aria-label="임시 저장 삭제"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm font-medium">
                {/* 자동 저장 표시 (새 노트 모드만) */}
                {!currentNoteId && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold transition-opacity duration-300 ${
                      autoSaveFlash ? "text-blue-600 opacity-100 dark:text-blue-300" : lastDraftSavedAt ? "text-blue-700 opacity-90 dark:text-blue-300" : "text-gray-400 opacity-70 dark:text-slate-500"
                    }`}
                    aria-live="polite"
                  >
                    <Clock size={12} />
                    {lastDraftSavedAt ? formatLastDraftSaveLabel(lastDraftSavedAt) : "5초마다 자동 저장"}
                  </span>
                )}
                {currentNoteId ? (
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={handleCopyToNewNote}
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-full shadow-sm text-xs sm:text-sm font-bold transition-colors dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900 dark:hover:bg-blue-950"
                      title="이 노트를 베이스로 새 노트 시작 (환자정보·치료내용 모두 복사)"
                    >
                      <Copy size={14} />
                      <span className="hidden sm:inline">복사하여 새 노트</span>
                      <span className="sm:hidden">복사</span>
                    </button>
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-5 sm:py-2.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full shadow-sm text-xs sm:text-sm dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/70">
                      <span className="hidden sm:inline">기존 노트 수정 중:</span>
                      <span className="sm:hidden">수정 중:</span>
                      <span className="font-bold truncate max-w-[80px] sm:max-w-none">{patientName || "(이름 없음)"}</span>
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-5 sm:py-2.5 bg-green-50 text-green-800 border border-green-200 rounded-full shadow-sm ml-auto text-xs sm:text-sm dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/70">
                    {copyFlash ? "📋 노트 복사 완료 — 환자/내용 수정 후 저장" : "✨ 새 노트 작성"}
                  </span>
                )}
              </div>
            </div>

            <div className={`text-gray-800 ${isGeneratingPdf ? 'space-y-4' : 'space-y-5 sm:space-y-12 dark:text-slate-200 print:space-y-6 print:text-black'}`}>
              <PatientInfoSection isGeneratingPdf={isGeneratingPdf} />
              <ComplaintSection isGeneratingPdf={isGeneratingPdf} />
              <BodyDiagramSection isGeneratingPdf={isGeneratingPdf} />
              <RomSection isGeneratingPdf={isGeneratingPdf} />
              <ClinicalSections isGeneratingPdf={isGeneratingPdf} />
            </div>

            {/* 서명 & 날짜 하단 배치 */}
            <div className={`${isGeneratingPdf ? 'mt-8 border-t-2 border-dashed border-gray-300 pt-6 flex flex-col items-end gap-2' : 'pt-8 pb-10 mt-12 flex flex-col items-end gap-6 bg-white p-8 rounded-3xl shadow-sm border border-gray-200 dark:bg-slate-900 dark:border-slate-800 dark:shadow-none print:border-none print:shadow-none print:p-0 print:mt-10 print:break-inside-avoid print:bg-white'}`}>
              <div className={`flex flex-col items-end gap-3 min-w-[280px] w-full sm:w-auto ${isGeneratingPdf ? 'w-1/2' : ''}`}>
                <div className="w-full flex justify-between items-center px-1">
                  <span className={`font-bold ${isGeneratingPdf ? 'text-base text-black' : 'text-lg text-gray-700 dark:text-slate-300 print:text-base print:text-black'}`}>담당 치료사:</span>
                  {displayTherapist ? (
                    <span className={`font-extrabold ${isGeneratingPdf ? 'text-lg text-black' : 'text-xl text-gray-900 dark:text-slate-100 print:text-lg print:text-black'}`}>
                      {displayTherapist.name} <span className="font-mono text-gray-500 tracking-tight text-sm dark:text-slate-400">({displayTherapist.id})</span>
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 italic dark:text-slate-500">기록 없음</span>
                  )}
                </div>
                
                <div className="w-full mt-2">
                  <div className={`w-full flex items-center justify-center italic ${isGeneratingPdf ? 'h-12 border-b-2 border-black text-black' : 'h-16 border-b-2 border-gray-400 bg-gray-50 rounded-2xl text-gray-500 text-lg shadow-inner dark:bg-slate-950 dark:border-slate-700 dark:text-slate-400 print:border-b-2 print:border-gray-800 print:shadow-none print:bg-transparent print:rounded-none print:text-black'}`}>
                    {displayTherapist ? `${displayTherapist.name} (전자서명)` : "(서명)"}
                  </div>
                </div>
                
                <div className="w-full flex justify-between items-center px-1 mt-4">
                  <label className={`font-bold ${isGeneratingPdf ? 'text-base text-black' : 'text-lg text-gray-700 dark:text-slate-300 print:text-base print:text-black'}`}>작성 일자:</label>
                  {isGeneratingPdf ? (
                    <span className="text-lg font-bold text-black border-b border-black text-right w-40 inline-block px-1">
                      {noteDate || "     .     .     "}
                    </span>
                  ) : (
                    <input type="date" className="p-2.5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-500 font-bold text-lg text-gray-800 bg-gray-50 shadow-sm dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 print:border-none print:shadow-none print:bg-transparent print:p-0 print:text-black text-right w-40"
                      {...methods.register("noteDate")} />
                  )}
                </div>
              </div>
            </div>
            
          </div>
        </div>

        {/* ── 고정 저장 & 모바일 PDF 버튼 ── */}
        {!isGeneratingPdf && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-8 sm:right-8 z-50 flex items-center justify-end gap-3 print:hidden">
            <button type="button" onClick={handleDownloadPDF} className="flex-1 sm:hidden flex items-center justify-center gap-2 px-5 py-4 bg-gray-800 hover:bg-gray-900 active:bg-gray-950 text-white font-bold text-lg rounded-2xl shadow-lg transition-all focus:outline-none focus:ring-4 focus:ring-gray-300">
              📄 PDF
            </button>
            <button type="submit" disabled={isSaving} className="flex-[2] sm:flex-none flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-extrabold text-lg sm:text-xl rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-blue-500/50 transform sm:hover:-translate-y-2 select-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17 3H5a2 2 0 00-2 2v10a2 2 0 002 2h10l4-4V5a2 2 0 00-2-2zm-5 12H7v-4h5v4zm4-6H4V5h12v4z" />
              </svg>
              {isSaving ? "저장 중..." : currentNoteId ? "수정 저장" : "새 노트 저장"}
            </button>
          </div>
        )}

        {/* ── 검증 에러 토스트 ── */}
        {!isGeneratingPdf && (
          <div className={`fixed bottom-[6.5rem] right-8 z-[100] flex items-center gap-3 px-6 py-4 bg-red-600 text-white font-bold text-lg rounded-2xl shadow-2xl transition-all duration-500 ease-out pointer-events-none transform print:hidden ${validationErrors.length > 0 ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-10 scale-95"}`}>
            <div className="bg-white/20 rounded-full p-1 border border-white/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            필수 항목을 입력해주세요: {validationErrors.join(", ")}
          </div>
        )}

        {/* ── 저장 성공 토스트 ── */}
        {!isGeneratingPdf && (
          <div className={`fixed bottom-[6.5rem] right-8 z-[100] flex items-center gap-3 px-6 py-4 bg-green-600 text-white font-bold text-lg rounded-2xl shadow-2xl transition-all duration-500 ease-out pointer-events-none transform print:hidden ${showSaved ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-10 scale-95"}`}>
            <div className="bg-white/20 rounded-full p-1 border border-white/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            노트가 성공적으로 저장되었습니다.
          </div>
        )}
      </form>
    </FormProvider>
  );
}
