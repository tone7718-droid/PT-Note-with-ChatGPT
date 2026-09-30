"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * 공용 PC 방치 시 환자 기록 노출을 줄이기 위한 자동 세션 잠금.
 * 로그인 상태에서 30분간 입력이 없으면 로그아웃한다.
 */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "pointerdown",
  "keydown",
  "touchstart",
  "wheel",
];

export default function AutoLock() {
  const therapist = useAuthStore((s) => s.therapist);
  const signOut = useAuthStore((s) => s.signOut);
  const lastActivityRef = useRef(0);

  useEffect(() => {
    if (!therapist) return;

    lastActivityRef.current = Date.now();
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        void signOut();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      window.clearInterval(interval);
    };
  }, [therapist, signOut]);

  return null;
}
