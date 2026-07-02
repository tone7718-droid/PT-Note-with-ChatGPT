"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNoteStore } from "@/store/useNoteStore";

interface LoginModalProps {
  onClose: () => void;
  hideCancel?: boolean;
}

export default function LoginModal({ onClose, hideCancel }: LoginModalProps) {
  const signIn = useAuthStore((s) => s.signIn);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hideCancel) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, hideCancel]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!userId.trim() || !password.trim()) {
      setError("ID 또는 비밀번호를 확인해주세요.");
      setLoading(false);
      return;
    }

    try {
      await signIn(userId.trim(), password);
      // 로그인 후 노트 목록 로드 — initSync 의 onAuthStateChange 는
      // 페이지 로드 시 한 번만 실행되므로 여기서 직접 불러와야 함
      await useNoteStore.getState().refreshNotes();
      setLoading(false);
      onClose();
    } catch (err) {
      setError((err as Error).message || "로그인에 실패했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all">
        <div className="p-8">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-6 text-center tracking-tight">치료사 로그인</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-id" className="block text-sm font-bold text-gray-700 mb-1.5">치료사 ID</label>
              <input id="login-id" type="text" value={userId} onChange={(e) => { setUserId(e.target.value); setError(""); }}
                placeholder="예: PT-001 또는 master"
                className="w-full p-4 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/30 focus:border-blue-500 font-medium text-lg placeholder:text-gray-400"
                autoFocus />
            </div>
            <div>
              <label htmlFor="login-pw" className="block text-sm font-bold text-gray-700 mb-1.5">비밀번호</label>
              <input id="login-pw" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                className="w-full p-4 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/30 focus:border-blue-500 font-medium text-lg placeholder:text-gray-400 tracking-widest" />
            </div>
            {error && <p className="text-red-500 text-sm font-bold text-center mt-2">{error}</p>}
            <div className="pt-6 flex gap-3">
              {!hideCancel && (
                <button type="button" onClick={onClose}
                  className="flex-[0.4] py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-lg rounded-2xl transition-all">취소</button>
              )}
              <button type="submit" disabled={loading}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all focus:ring-4 focus:ring-blue-500/40">{loading ? "인증 중..." : "로그인"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
