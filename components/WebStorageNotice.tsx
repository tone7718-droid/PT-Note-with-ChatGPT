"use client";
import { useSyncExternalStore } from "react";

/** Desktop/mobile apps keep data in an app sandbox; only a plain browser shares it with the browser profile. */
export function isPlainBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean }; electronAPI?: unknown };
  return !("__TAURI_INTERNALS__" in window) && !w.Capacitor?.isNativePlatform?.() && !w.electronAPI;
}

export default function WebStorageNotice() {
  // Server snapshot is false so the static export never renders the notice before hydration.
  const show = useSyncExternalStore(() => () => {}, isPlainBrowser, () => false);
  if (!show) return null;
  return (
    <p role="note" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <strong className="block mb-1">웹 브라우저판 보안 안내</strong>
      기록은 이 브라우저에 암호화되어 저장되지만, 이 PC의 브라우저 프로필에 접근할 수 있는 사람은 기록을 열 수 있습니다.
      여러 사람이 쓰는 PC에서는 데스크톱 앱을 사용하고, 정기적으로 암호화 백업 내보내기를 해두세요.
    </p>
  );
}
