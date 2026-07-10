"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

/**
 * 공용 모달 래퍼 — 오버레이·z-index·패널(radius/배경/다크)을 한 곳에서 표준화.
 *
 * layer (z-index 사다리, 기존 화면들의 수동 값을 그대로 계승):
 *   login  z-[100] — 로그인 전용 최하층
 *   base   z-[150] — 대형 콘텐츠 모달 (치료사 관리, 매크로, 백업 복원)
 *   raised z-[200] — base 위에 뜨는 확인/보조 모달
 *   top    z-[250] — 최상층 (비밀번호 재확인 등)
 *
 * size:
 *   sm    확인/입력형 소형 패널 (max-w-sm, p-8)
 *   plain 소형 패널, 내부에서 자체 레이아웃 (max-w-sm, 패딩 없음)
 *   lg    대형 콘텐츠 패널 (max-w-2xl, 헤더/바디 자체 구성, max-h-[90vh])
 */

const LAYERS = {
  login: "z-[100]",
  base: "z-[150]",
  raised: "z-[200]",
  top: "z-[250]",
} as const;

const SIZES = {
  sm: "max-w-sm p-8",
  plain: "max-w-sm overflow-hidden",
  lg: "max-w-2xl overflow-hidden flex flex-col max-h-[90vh]",
} as const;

export interface ModalProps {
  layer?: keyof typeof LAYERS;
  size?: keyof typeof SIZES;
  /** 오버레이 클릭으로 닫기. 미지정 시 오버레이 클릭 무시. */
  onOverlayClick?: () => void;
  overlayClassName?: string;
  panelClassName?: string;
  children: React.ReactNode;
}

export function Modal({
  layer = "raised",
  size = "sm",
  onOverlayClick,
  overlayClassName,
  panelClassName,
  children,
}: ModalProps) {
  /* document.body 로 포털 렌더 — 모바일 drawer 처럼 transform 이 걸린 조상
     안에서 열려도 fixed 오버레이가 뷰포트 전체를 덮도록 보장.
     (transform 은 fixed 자손의 containing block 이 되는 CSS 함정) */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200",
        LAYERS[layer],
        // 대형(base 이하)은 진한 블러, 그 위에 겹치는 확인류는 얕은 블러
        layer === "base" || layer === "login"
          ? "bg-black/60 backdrop-blur-md"
          : "bg-black/50 backdrop-blur-sm",
        overlayClassName
      )}
      onClick={onOverlayClick}
    >
      <div
        className={cn(
          "bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full animate-in zoom-in-95 duration-200",
          SIZES[size],
          panelClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
