"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Lock, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import { useNoteStore } from "@/store/useNoteStore";
import type { AutoBackupEntry } from "@/lib/backupService";

interface BackupManagementModalProps {
  onClose: () => void;
}

export default function BackupManagementModal({ onClose }: BackupManagementModalProps) {
  const exportEncryptedBackup = useNoteStore((s) => s.exportEncryptedBackup);
  const importBackupText = useNoteStore((s) => s.importBackupText);
  const getAutoBackups = useNoteStore((s) => s.getAutoBackups);
  const restoreAutoBackup = useNoteStore((s) => s.restoreAutoBackup);

  const [exportPw, setExportPw] = useState("");
  const [importPw, setImportPw] = useState("");
  const [selectedBackupText, setSelectedBackupText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoBackups, setAutoBackups] = useState<AutoBackupEntry[]>(() => getAutoBackups());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFileEncrypted = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedBackupText) as { format?: string };
      return parsed.format === "pt-note-encrypted-backup";
    } catch {
      return false;
    }
  }, [selectedBackupText]);

  const handleExport = async () => {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const text = await exportEncryptedBackup(exportPw);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pt-note-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("암호화 백업 파일을 내보냈습니다.");
      setExportPw("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSelectedBackupText(String(ev.target?.result ?? ""));
      setSelectedFileName(file.name);
      setError("");
      setStatus("");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRestoreFile = async () => {
    if (!selectedBackupText) {
      setError("복원할 백업 파일을 선택해주세요.");
      return;
    }
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const result = await importBackupText(selectedBackupText, importPw);
      setStatus(`복원 완료: 노트 ${result.notesCount}건, 치료사 ${result.therapistsCount}건 추가`);
      setImportPw("");
      setSelectedBackupText("");
      setSelectedFileName("");
      setAutoBackups(getAutoBackups());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreAutoBackup = async (id: string) => {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const result = await restoreAutoBackup(id);
      setStatus(`자동 백업 복원 완료: 노트 ${result.notesCount}건, 치료사 ${result.therapistsCount}건 추가`);
      setAutoBackups(getAutoBackups());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-blue-50 text-blue-700">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-gray-900">백업 / 복원</h2>
              <p className="text-xs text-gray-500 font-medium">환자 기록을 암호화 파일과 자동 백업으로 보호합니다.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-76px)] px-5 sm:px-7 py-5 space-y-5 bg-gray-50">
          <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Lock size={18} className="text-blue-700" />
              <h3 className="font-black text-gray-900">암호화 백업 내보내기</h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={exportPw}
                onChange={(e) => setExportPw(e.target.value)}
                placeholder="백업 비밀번호 8자 이상"
                className="flex-1 px-4 py-3 border-2 border-gray-100 bg-gray-50 rounded-xl font-bold outline-none focus:border-blue-400"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleExport}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 disabled:bg-blue-300 hover:bg-blue-700 text-white font-black rounded-xl"
              >
                <Download size={18} /> 내보내기
              </button>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Upload size={18} className="text-green-700" />
              <h3 className="font-black text-gray-900">백업 파일 복원</h3>
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelected} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-left"
              >
                {selectedFileName || "백업 파일 선택"}
              </button>
              {selectedFileEncrypted && (
                <input
                  type="password"
                  value={importPw}
                  onChange={(e) => setImportPw(e.target.value)}
                  placeholder="백업 비밀번호"
                  className="w-full px-4 py-3 border-2 border-gray-100 bg-gray-50 rounded-xl font-bold outline-none focus:border-green-400"
                />
              )}
              <button
                type="button"
                disabled={busy || !selectedBackupText}
                onClick={handleRestoreFile}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-600 disabled:bg-green-300 hover:bg-green-700 text-white font-black rounded-xl"
              >
                <RotateCcw size={18} /> 복원하기
              </button>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <RotateCcw size={18} className="text-amber-700" />
                <h3 className="font-black text-gray-900">최근 자동 백업</h3>
              </div>
              <button type="button" onClick={() => setAutoBackups(getAutoBackups())} className="text-xs font-black text-gray-500 hover:text-gray-800">
                새로고침
              </button>
            </div>
            {autoBackups.length === 0 ? (
              <p className="text-sm text-gray-500 font-medium">아직 자동 백업이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {autoBackups.map((backup) => (
                  <li key={backup.id} className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-800 truncate">{formatDateTime(backup.createdAt)}</p>
                      <p className="text-xs text-gray-500 font-medium">노트 {backup.notesCount}건 · 치료사 {backup.therapistsCount}명</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRestoreAutoBackup(backup.id)}
                      className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-black rounded-lg text-xs"
                    >
                      복원
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(status || error) && (
            <p className={`text-sm font-bold px-4 py-3 rounded-xl ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {error || status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
