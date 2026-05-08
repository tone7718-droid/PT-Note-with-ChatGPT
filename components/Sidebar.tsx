"use client";

import { useState, useRef } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Menu, Search, Plus, Trash2, UserPlus, LogIn, ChevronDown, ChevronRight, ArrowRightLeft, Shield, Download, Upload, Sparkles } from "lucide-react";
import LoginModal from "./LoginModal";
import TherapistManagementModal from "./TherapistManagementModal";
import MacroManagementModal from "./MacroManagementModal";
import { getDeleteToolbarAction } from "@/lib/progressNoteUi";

export default function Sidebar() {
  const notes = useNoteStore((s) => s.notes);
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  const selectNote = useNoteStore((s) => s.selectNote);
  const createNewNote = useNoteStore((s) => s.createNewNote);
  const deleteNotes = useNoteStore((s) => s.deleteNotes);
  const transferNotes = useNoteStore((s) => s.transferNotes);
  const exportData = useNoteStore((s) => s.exportData);
  const importData = useNoteStore((s) => s.importData);
  
  const therapist = useAuthStore((s) => s.therapist);
  const therapists = useAuthStore((s) => s.therapists);
  const signOut = useAuthStore((s) => s.signOut);
  const reauthenticate = useAuthStore((s) => s.reauthenticate);

  const getResignedTherapistNotes = () => {
    const resigned = therapists.filter((t) => t.resigned);
    return resigned
      .map((rt) => ({
        therapistName: rt.name,
        therapistUid: rt.uid,
        notes: notes.filter((n) => n.therapistUid === rt.uid),
      }))
      .filter((g) => g.notes.length > 0);
  };
  const [search, setSearch] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showTherapistModal, setShowTherapistModal] = useState(false);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResignedFolder, setShowResignedFolder] = useState(false);

  /* ── 삭제 2단계 비밀번호 확인 ── */
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deletePwError, setDeletePwError] = useState("");

  /* ── 이관 ── */
  const [transferSource, setTransferSource] = useState<{ therapistUid: string; therapistName: string } | null>(null);

  /* ── 데이터 내보내기/가져오기 ── */
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportData = async () => {
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pt-progress-notes-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("데이터 내보내기에 실패했습니다.");
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const result = await importData(ev.target?.result as string);
        alert(`가져오기 완료: 노트 ${result.notesCount}건 추가됨`);
      } catch {
        alert("데이터 가져오기 실패: 올바른 JSON 파일인지 확인해주세요.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      alert("로그아웃에 실패했습니다.");
    }
  };

  const isMaster = therapist?.role === "master";

  /* 현재 로그인된 치료사의 노트만 표시 (master는 전체, 단 퇴사자 노트는 폴더에서만) */
  const visibleNotes = notes.filter((n) => {
    if (isMaster) {
      const isResigned = therapists.some((t) => t.resigned && t.uid === n.therapistUid);
      return !isResigned;
    }
    if (therapist) return n.therapistUid === therapist.uid || !n.therapistUid;
    return true;
  });

  const filteredNotes = visibleNotes
    .filter(
      (n) =>
        n.patientName.includes(search) ||
        n.diagnosis.includes(search) ||
        n.chartNo.includes(search)
    )
    .sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());

  const resignedGroups = getResignedTherapistNotes();
  const activeTherapists = therapists.filter((t) => !t.resigned && t.role !== "master");

  const handleDeleteToolbarClick = () => {
    const action = getDeleteToolbarAction({
      isDeleteMode,
      selectedCount: selectedIds.length,
    });

    if (action === "enter") {
      setIsDeleteMode(true);
      setSelectedIds([]);
      return;
    }

    if (action === "exit") {
      setIsDeleteMode(false);
      setSelectedIds([]);
      return;
    }

    setShowDeleteModal(true);
  };

  const handleDeleteStep1Confirm = () => {
    if (selectedIds.length === 0) return;
    setShowDeleteModal(false);
    setShowPwConfirm(true);
    setDeletePw("");
    setDeletePwError("");
  };

  const handleDeleteStep2Confirm = async () => {
    if (!therapist || !therapist.id) {
      setDeletePwError("로그인 정보를 확인할 수 없습니다.");
      return;
    }
    setDeletePwError("");
    try {
      // 1) 비밀번호 재확인 (10초 타임아웃)
      const ok = await Promise.race<boolean>([
        reauthenticate(therapist.id, deletePw),
        new Promise<boolean>((_, rej) =>
          setTimeout(() => rej(new Error("비밀번호 확인 시간 초과")), 10000)
        ),
      ]);
      if (!ok) {
        setDeletePwError("비밀번호가 일치하지 않습니다.");
        return;
      }

      // 2) 실제 삭제 (15초 타임아웃)
      await Promise.race<void>([
        deleteNotes(selectedIds),
        new Promise<void>((_, rej) =>
          setTimeout(() => rej(new Error("삭제 요청 시간 초과")), 15000)
        ),
      ]);

      // 3) 모달/상태 정리
      setIsDeleteMode(false);
      setSelectedIds([]);
      setShowPwConfirm(false);
      setDeletePw("");
      alert("선택한 기록이 삭제되었습니다.");
    } catch (err) {
      console.error("[delete] failed:", err);
      setDeletePwError(
        (err as Error)?.message ?? "삭제 처리 중 오류가 발생했습니다."
      );
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative dark:bg-slate-950">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 shrink-0 dark:border-slate-800">
        <div className="relative flex-shrink-0">
          <button onClick={() => setShowDropdown(!showDropdown)} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-700 transition-colors dark:text-slate-200 dark:hover:bg-slate-800" aria-label="메뉴 열기" title="메뉴 열기"><Menu size={24} /></button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-[50]" onClick={() => setShowDropdown(false)} />
              <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-150 dark:bg-slate-900 dark:border-slate-700">
                <button onClick={() => { setShowLoginModal(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-blue-300"><LogIn size={18} /> 로그인</button>
                <button onClick={() => { setShowTherapistModal(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-green-300"><UserPlus size={18} /> 치료사 등록 / 관리</button>
                <button onClick={() => { setShowMacroModal(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-blue-300"><Sparkles size={18} /> 매크로 관리 (/도수1~20)</button>
                <hr className="my-1 border-gray-100 dark:border-slate-800" />
                <button onClick={() => { handleExportData(); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-purple-300"><Download size={18} /> 데이터 내보내기</button>
                <button onClick={() => { fileInputRef.current?.click(); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-orange-300"><Upload size={18} /> 데이터 가져오기</button>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 relative">
          <input id="sidebar-search" type="text" placeholder="환자 이름 · 진단명 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-4 pr-11 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" aria-label="기록 검색" />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-300" aria-label="검색 실행"><Search size={18} /></button>
        </div>
      </div>

      {therapist && (
        <div className="px-4 pt-4 shrink-0">
          <div className="flex items-center justify-between gap-2 text-[15px] font-bold text-gray-800 bg-blue-50 px-4 py-3 rounded-2xl border border-blue-100 shadow-sm w-full dark:bg-blue-950/30 dark:border-blue-900/70 dark:text-slate-100 dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className={`${isMaster ? "bg-amber-500" : "bg-blue-600"} text-white p-1.5 rounded-full`}><Shield size={16} /></div>
              <span className="truncate">{therapist.name} {therapist.id && <span className="text-gray-400 font-mono text-xs dark:text-slate-500">({therapist.id})</span>}</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-red-500 hover:text-red-700 font-bold bg-white px-2.5 py-1.5 rounded-lg border border-red-100 shadow-sm transition-colors dark:bg-slate-900 dark:border-red-900/60 dark:text-red-300 dark:hover:text-red-200">로그아웃</button>
          </div>
        </div>
      )}

      <div className="p-4 shrink-0 pb-2">
        <button type="button" onClick={createNewNote} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5"><Plus size={20} /> 새 노트 작성</button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-slate-950">
        <div className="px-4 pt-2 pb-1 flex justify-between items-center">
          <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400">최신 치료 내역</h3>
          {filteredNotes.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteToolbarClick}
              className={`p-1.5 rounded-md transition-colors ${isDeleteMode ? "text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300" : "text-gray-400 hover:bg-gray-200 dark:text-slate-500 dark:hover:bg-slate-800"}`}
              aria-label={isDeleteMode && selectedIds.length > 0 ? "선택한 기록 삭제" : "삭제 모드 전환"}
              title={isDeleteMode && selectedIds.length > 0 ? "선택한 기록 삭제" : "삭제 모드 전환"}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {filteredNotes.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center h-32 opacity-40 justify-center text-sm font-medium dark:text-slate-400">기록이 없습니다.</div>
        ) : (
          <ul className="p-3 space-y-2.5">
            {filteredNotes.map((note) => (
              <li key={note.id} onClick={() => { if (isDeleteMode) setSelectedIds(prev => prev.includes(note.id) ? prev.filter(i => i !== note.id) : [...prev, note.id]); else selectNote(note.id); }}
                className={`group p-4 rounded-2xl cursor-pointer transition-all border-2 flex items-center gap-3 ${selectedNoteId === note.id && !isDeleteMode ? "bg-blue-50/50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800" : "bg-white border-transparent shadow-sm dark:bg-slate-900 dark:border-slate-800 dark:shadow-none"} ${isDeleteMode && selectedIds.includes(note.id) ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : ""}`}>
                {isDeleteMode && <input type="checkbox" checked={selectedIds.includes(note.id)} readOnly className="w-5 h-5 rounded border-gray-300 text-red-600" aria-label={`${note.patientName} 기록 선택`} />}
                <span className={`font-bold text-[15px] truncate block w-full text-left ${selectedNoteId === note.id && !isDeleteMode ? "text-blue-800 dark:text-blue-200" : isDeleteMode && selectedIds.includes(note.id) ? "text-red-800 dark:text-red-200" : "text-gray-900 dark:text-slate-100"}`}>
                  {note.patientName || "(이름 없음)"} - {formatDate(note.savedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {isMaster && resignedGroups.length > 0 && (
          <div className="px-3 pb-3 mt-2">
            <button onClick={() => setShowResignedFolder(!showResignedFolder)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-200">
              {showResignedFolder ? <ChevronDown size={16} /> : <ChevronRight size={16} />} 퇴사한 치료사 기록 <span className="ml-auto text-xs bg-amber-200 px-2 py-0.5 rounded-full dark:bg-amber-900/70">{resignedGroups.reduce((s, g) => s + g.notes.length, 0)}</span>
            </button>
            {showResignedFolder && (
              <div className="mt-2 space-y-3">
                {resignedGroups.map((group) => (
                  <div key={group.therapistUid} className="bg-white rounded-xl border border-gray-200 p-3 dark:bg-slate-900 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-50 dark:border-slate-800">
                      <span className="text-sm font-bold text-gray-700 dark:text-slate-200">{group.therapistName} (퇴사)</span>
                      <button onClick={() => setTransferSource({ therapistUid: group.therapistUid, therapistName: group.therapistName })} className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900 dark:hover:bg-blue-950"><ArrowRightLeft size={12} /> 이관</button>
                    </div>
                    <ul className="space-y-1">
                      {group.notes.map((note) => (
                        <li key={note.id} onClick={() => selectNote(note.id)} className={`p-2.5 rounded-lg cursor-pointer text-sm font-medium transition-colors ${selectedNoteId === note.id ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200" : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                          {note.patientName || "(이름 없음)"} - {formatDate(note.savedAt)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 shrink-0 border-t border-gray-100 flex items-center justify-between min-h-[56px] dark:bg-slate-950 dark:border-slate-800">
        <span className="text-xs font-bold text-gray-400 dark:text-slate-500">총 {notes.length}건</span>
        {isDeleteMode && selectedIds.length > 0 && (
          <button onClick={() => setShowDeleteModal(true)} className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors">기록 삭제 ({selectedIds.length}건)</button>
        )}
      </div>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
      {showTherapistModal && <TherapistManagementModal onClose={() => setShowTherapistModal(false)} />}
      {showMacroModal && <MacroManagementModal onClose={() => setShowMacroModal(false)} />}
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportData} className="hidden" />

      {/* ── 삭제 확인 모달 (1단계) ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900 dark:border dark:border-slate-700">
            <h3 className="text-xl font-bold text-gray-900 mb-2 dark:text-white">기록 삭제 경고</h3>
            <p className="text-gray-600 mb-8 font-medium leading-relaxed dark:text-slate-300">선택한 <span className="font-bold text-red-600 dark:text-red-300">{selectedIds.length}건</span>의 기록을<br />정말로 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">아니오</button>
              <button onClick={handleDeleteStep1Confirm} className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors">예 (삭제)</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 2단계: 비밀번호 확인 ── */}
      {showPwConfirm && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900 dark:border dark:border-slate-700">
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center text-balance dark:text-white">본인 확인 비밀번호</h3>
            <p className="text-gray-500 mb-6 font-medium text-sm text-center dark:text-slate-400">삭제를 완료하려면 치료사의<br />비밀번호를 다시 입력해주세요.</p>
            <label htmlFor="confirm-delete-pw" className="sr-only">비밀번호 입력</label>
            <input id="confirm-delete-pw" type="password" value={deletePw} onChange={(e) => { setDeletePw(e.target.value); setDeletePwError(""); }} placeholder="비밀번호 입력"
              className="w-full p-4 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-center font-bold tracking-widest outline-none mb-3 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" autoFocus />
            {deletePwError && <p className="text-red-500 text-sm font-bold text-center mb-3">{deletePwError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowPwConfirm(false); setDeletePw(""); }} className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">취소</button>
              <button onClick={handleDeleteStep2Confirm} className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors">삭제 확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이관 모달 ── */}
      {transferSource && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 dark:bg-slate-900 dark:border dark:border-slate-700">
            <h3 className="text-xl font-bold text-gray-900 mb-2 dark:text-white">기록 이관</h3>
            <p className="text-gray-600 mb-6 text-sm dark:text-slate-300">퇴사한 {transferSource.therapistName}의 모든 기록을<br />아래 치료사 중 한 명에게 이관합니다.</p>
            <ul className="space-y-2 max-h-48 overflow-y-auto mb-6">
              {activeTherapists.map((t) => (
                <li key={t.uid}>
                  <button onClick={async () => {
                    try {
                      await transferNotes(transferSource.therapistUid, t.uid, t.name, t.id);
                      setTransferSource(null);
                      alert(`${t.name} 치료사에게 이관되었습니다.`);
                    } catch {
                      alert("이관 처리 중 오류가 발생했습니다.");
                    }
                  }}
                    className="w-full flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all font-bold text-left dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-800 dark:hover:border-blue-800">
                    <span>{t.name} <span className="text-gray-400 font-mono text-xs dark:text-slate-500">({t.id})</span></span>
                    <ArrowRightLeft size={14} className="text-blue-500" />
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setTransferSource(null)} className="w-full py-3.5 bg-gray-100 font-bold rounded-xl dark:bg-slate-800 dark:text-slate-200">취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch { return isoStr; }
}
