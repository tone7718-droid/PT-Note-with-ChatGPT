"use client";

import { create } from "zustand";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  init: () => void;
}

const THEME_STORAGE_KEY = "pt-theme";
let systemThemeListenerAttached = false;

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {}
  return "light";
}

function persistTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: "light",
  resolved: "light",

  setTheme: (theme) => {
    const resolved = theme === "system" ? getSystemTheme() : theme;
    applyTheme(resolved);
    persistTheme(theme);
    set({ theme, resolved });
  },

  toggleTheme: () => {
    const nextTheme = get().resolved === "dark" ? "light" : "dark";
    get().setTheme(nextTheme);
  },

  init: () => {
    const theme = getStoredTheme();
    const resolved = theme === "system" ? getSystemTheme() : theme;
    applyTheme(resolved);
    set({ theme, resolved });

    if (typeof window === "undefined" || !window.matchMedia || systemThemeListenerAttached) return;
    systemThemeListenerAttached = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (get().theme !== "system") return;
      const nextResolved = getSystemTheme();
      applyTheme(nextResolved);
      set({ resolved: nextResolved });
    });
  },
}));

export type { ResolvedTheme, Theme };
