"use client";

import Sidebar from "@/components/Sidebar";
import ProgressNoteForm from "@/components/ProgressNoteForm";
import LoginModal from "@/components/LoginModal";
import UpdateChecker from "@/components/UpdateChecker";
import AutoLock from "@/components/AutoLock";
import TrendPanel from "@/components/TrendPanel";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNoteStore } from "@/store/useNoteStore";
import { useThemeStore } from "@/store/useThemeStore";

function HomeContent() {
  const therapist = useAuthStore((state) => state.therapist);
  const authLoading = useAuthStore((state) => state.isLoading);
  const noteLoading = useNoteStore((state) => state.isLoading);
  const initSync = useNoteStore((state) => state.initSync);
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  const initTheme = useThemeStore((state) => state.init);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const resolvedTheme = useThemeStore((state) => state.resolved);
  const [menuOpen, setMenuOpen] = useState(false);
  const loading = authLoading || noteLoading;

  useEffect(() => { initTheme(); }, [initTheme]);
  useEffect(() => { initSync(); }, [initSync]);
  useEffect(() => {
    const timer = window.setTimeout(() => setMenuOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [selectedNoteId]);
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-slate-950"><div className="text-center"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /><p className="font-bold text-gray-500 dark:text-slate-400">Loading...</p></div></div>;
  if (!therapist) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-slate-950"><LoginModal onClose={() => {}} hideCancel /></div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 font-sans text-gray-900 dark:bg-slate-950 dark:text-slate-100 lg:flex-row">
      <div className="z-30 flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:hidden">
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-800"><Menu size={24} /></button>
        <h1 className="text-base font-extrabold tracking-tight">PT-NOTE</h1>
        <div className="flex min-w-0 items-center gap-1.5"><span className="max-w-[90px] truncate text-xs font-bold text-gray-500 dark:text-slate-400">{therapist.name}</span><button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-800">{resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button></div>
      </div>

      <div className="z-10 hidden h-full w-[360px] flex-shrink-0 flex-col border-r border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:flex xl:w-[400px]"><Sidebar /></div>
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <div className={`fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 dark:bg-slate-950 lg:hidden ${menuOpen ? "translate-x-0" : "-translate-x-full"}`} role="dialog" aria-modal="true" aria-label="Mobile menu"><button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="absolute right-2 top-2 z-10 rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={22} /></button><div className="flex-1 overflow-hidden"><Sidebar /></div></div>

      <div className="relative w-full flex-1 overflow-y-auto bg-white scroll-smooth dark:bg-slate-950"><ProgressNoteForm /></div>
      <TrendPanel />
      <UpdateChecker />
      <AutoLock />
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
