"use client";

import { useEffect, useState } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import type { AutoBackupEntry } from "@/lib/backupService";
import { AlertCircle, History, RotateCcw, X } from "lucide-react";

interface BackupRestoreModalProps {
  onClose: () => void;
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function BackupRestoreModal({ onClose }: BackupRestoreModalProps) {
  const getAutoBackups = useNoteStore((s) => s.getAutoBackups);
  const restoreAutoBackup = useNoteStore((s) => s.restoreAutoBackup);
  const [backups, setBackups] = useState<AutoBackupEntry[] | null>(null);
  const [confirming, setConfirming] = useState<AutoBackupEntry | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setBackups(getAutoBackups());
  }, [getAutoBackups]);

  const handleRestore = async () => {
    if (!confirming) return;
    setError("");
    setRestoring(true);
    try {
      const result = await restoreAutoBackup(confirming.id);
      alert(`복원 완료: 노트 ${result.notesCount}건, 치료사 ${result.therapistsCount}명 기준으로 복원했습니다.`);
      onClose();
    } catch (err) {
      setError((err as Error).message || "복원 중 오류가 발생했습니다.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <History className="text-blue-600 dark:text-blue-400" size={24} /> 자동 백업 복원
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-500 dark:text-gray-400" aria-label="모달 닫기"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            삭제·가져오기 직전에 저장된 최근 자동 백업입니다. 복원 전 현재 상태도 자동 백업에 남습니다.
          </p>

          {backups === null ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm font-bold">불러오는 중...</p>
          ) : backups.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm font-bold bg-gray-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-gray-100 dark:border-slate-700">
              저장된 자동 백업이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {backups.map((backup) => (
                <li key={backup.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl border-2 border-gray-100 dark:border-slate-700">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{formatDateTime(backup.createdAt)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      노트 {backup.notesCount}건 · 치료사 {backup.therapistsCount}명
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setConfirming(backup); setError(""); }}
                    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl border border-blue-100 dark:border-blue-800 transition-colors"
                  >
                    <RotateCcw size={14} /> 복원
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-6 mx-auto">
              <AlertCircle size={32} className="text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center text-balance">백업으로 복원</h3>
            <p className="text-center text-gray-500 dark:text-gray-400 mb-6 leading-relaxed text-sm">
              <span className="font-bold text-gray-800 dark:text-gray-200">{formatDateTime(confirming.createdAt)}</span> 시점으로 복원하시겠습니까?
            </p>
            {error && <p className="text-red-500 dark:text-red-400 text-xs font-bold text-center mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setConfirming(null)} className="flex-1 py-3.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl transition-colors">취소</button>
              <button onClick={handleRestore} disabled={restoring} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl shadow-lg transition-colors">
                {restoring ? "복원 중..." : "복원"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
