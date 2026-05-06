"use client";

import Sidebar from "@/components/Sidebar";
import ProgressNoteForm from "@/components/ProgressNoteForm";
import LoginModal from "@/components/LoginModal";
import UpdateChecker from "@/components/UpdateChecker";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNoteStore } from "@/store/useNoteStore";

function HomeContent() {
  const therapist = useAuthStore((s) => s.therapist);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const isNoteLoading = useNoteStore((s) => s.isLoading);
  const isLoading = isAuthLoading || isNoteLoading;
  const initSync = useNoteStore((s) => s.initSync);
  const checkLocalData = useNoteStore((s) => s.checkLocalData);
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);

  // 모바일 사이드바 (drawer) 토글
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    checkLocalData();
    initSync();
  }, [checkLocalData, initSync]);

  // 모바일 환경에서 노트가 변경되면 drawer 자동 닫음 (목록 → 노트 보기 전환)
  useEffect(() => {
    const timer = window.setTimeout(() => setMobileSidebarOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [selectedNoteId]);

  // drawer 열린 동안 배경 스크롤 잠금
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileSidebarOpen]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!therapist) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <LoginModal onClose={() => {}} hideCancel />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* ── 모바일 전용 상단 바 (lg 미만에서만 표시) ── */}
      <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 shadow-sm z-30 flex-shrink-0">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="환자 목록 / 메뉴 열기"
          className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <Menu size={24} className="text-gray-700" />
        </button>
        <h1 className="font-extrabold text-gray-900 tracking-tight text-base">PT-NOTE</h1>
        <span className="text-xs font-bold text-gray-500 truncate max-w-[120px]">
          {therapist.name}
        </span>
      </div>

      {/* ── Sidebar ── */}
      {/* 데스크톱: 항상 좌측에 정적으로 표시 */}
      <div className="hidden lg:flex w-[360px] xl:w-[400px] flex-shrink-0 flex-col h-full border-r border-gray-200 bg-white shadow-sm z-10">
        <Sidebar />
      </div>

      {/* 모바일: drawer (좌측에서 슬라이드) */}
      <>
        {/* Backdrop */}
        {mobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
        )}

        {/* Drawer */}
        <div
          className={`lg:hidden fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="환자 목록 및 메뉴"
        >
          <button
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="메뉴 닫기"
            className="absolute top-2 right-2 z-10 p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <X size={22} className="text-gray-600" />
          </button>
          <div className="flex-1 overflow-hidden">
            <Sidebar />
          </div>
        </div>
      </>

      {/* ── Form (메인) ── */}
      <div className="w-full flex-1 overflow-y-auto relative bg-white scroll-smooth">
        <ProgressNoteForm />
      </div>

      {/* Tauri 데스크톱 앱 전용 — 자동 업데이트 체커 (웹에서는 렌더 안 됨) */}
      <UpdateChecker />
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
