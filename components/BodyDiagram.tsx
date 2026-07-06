"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { PainEntry, PainLevel, PainView } from "@/types";
import {
  smoothPath,
  MIRROR_TRANSFORM,
  ANT_SILHOUETTE,
  ANT_CENTER,
  ANT_PAIRED,
  POST_SILHOUETTE,
  POST_CENTER,
  POST_PAIRED,
  type CenterShape,
  type PairedShape,
  type DiagramShape,
} from "./bodyDiagramShapes";

/* ════════════════════════════════════════════════════════
   Body Diagram (Clinical Pain Map) — 해부학 실루엣 버전
   - 반쪽 저작 + 미러 그룹으로 좌우 대칭 전신 구성
   - Catmull-Rom 스무딩 경로 / 뼈·심부근육 구분 톤
   - 길게 누르기 → 돋보기(1.5x), 손가락 추적 (elementFromPoint)
   - 데스크톱 호버 툴팁
   - 외부 인터페이스는 앱 표준인 PainEntry[] (view + region + painLevel) 유지 →
     저장/PDF 요약/하위호환 그대로. 내부에서만 Map 으로 변환해 처리.
   ════════════════════════════════════════════════════════ */

const PAIN_LABEL: Record<PainLevel, string> = {
  1: "경도(Mild)",
  2: "중등도(Moderate)",
  3: "중증(Severe)",
};

const SEVERITY_COLOR: Record<PainLevel, { fill: string; stroke: string; tw: string }> = {
  1: { fill: "#fde047", stroke: "#ca8a04", tw: "bg-yellow-300 border-yellow-600" },
  2: { fill: "#f97316", stroke: "#c2410c", tw: "bg-orange-500 border-orange-700" },
  3: { fill: "#ef4444", stroke: "#991b1b", tw: "bg-red-500 border-red-800" },
};

const LENS_PX = 192; // Tailwind w-48 / h-48
const LENS_HALF = LENS_PX / 2;
const LENS_ZOOM = 1.5;
const LENS_OFFSET_Y = -140; // 손가락 위쪽으로 띄움
const LONG_PRESS_MS = 400;
const DRAG_THRESHOLD = 10;

/** 실루엣 path (모듈 로드 시 1회 계산) — 반개방 경로를 Z로 정중선 마감 */
const ANT_SIL_D = smoothPath(ANT_SILHOUETTE, false) + " Z";
const POST_SIL_D = smoothPath(POST_SILHOUETTE, false) + " Z";

type ShapeVariant = "muscle" | "muscle-deep" | "bone";

/* ─────────────────────────────────────────
   Pain map helpers (PainEntry[] ↔ Map)
   ───────────────────────────────────────── */
type PainKey = string;
const painKey = (view: PainView, region: string): PainKey => `${view}::${region}`;

function entriesToMap(entries: PainEntry[]): Map<PainKey, PainLevel> {
  const m = new Map<PainKey, PainLevel>();
  for (const e of entries) m.set(painKey(e.view, e.region), e.painLevel);
  return m;
}

function mapToEntries(m: Map<PainKey, PainLevel>): PainEntry[] {
  const result: PainEntry[] = [];
  for (const [key, level] of m) {
    const sep = key.indexOf("::");
    const view = key.slice(0, sep) as PainView;
    const region = key.slice(sep + 2);
    result.push({ view, region, painLevel: level });
  }
  return result;
}

export type BodyDiagramProps = {
  value?: PainEntry[];
  onChange?: (entries: PainEntry[]) => void;
};

export default function BodyDiagram({ value, onChange }: BodyDiagramProps) {
  const [internal, setInternal] = useState<PainEntry[]>([]);
  const ctrl = value !== undefined && onChange !== undefined;
  const entries = ctrl ? value! : internal;
  const setEntries = ctrl ? onChange! : setInternal;

  const painMap = useMemo(() => entriesToMap(entries), [entries]);

  // 데스크톱 호버 툴팁
  const [hovered, setHovered] = useState<{ name: string; view: PainView; level: number; x: number; y: number } | null>(null);

  // 돋보기
  const [magnify, setMagnify] = useState<{
    active: boolean;
    x: number; // viewport touch x
    y: number;
    targetName: string | null;
    view: PainView | null;
    svgRect: DOMRect | null;
  } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef({
    x: 0,
    y: 0,
    name: null as string | null,
    view: null as PainView | null,
  });
  const isDragging = useRef(false);
  const magnifyRef = useRef(magnify);

  const svgAntRef = useRef<SVGSVGElement>(null);
  const svgPostRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    magnifyRef.current = magnify;
  }, [magnify]);

  // 돋보기 활성 시 페이지 스크롤 방지
  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (magnifyRef.current?.active) e.preventDefault();
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", handleTouchMove);
  }, []);

  const cyclePainLevel = (view: PainView, name: string) => {
    const k = painKey(view, name);
    const cur = painMap.get(k) ?? 0;
    const next = (cur + 1) % 4;
    const map = new Map(painMap);
    if (next === 0) map.delete(k);
    else map.set(k, next as PainLevel);
    setEntries(mapToEntries(map));
  };

  const removeEntry = (view: PainView, region: string) => {
    const map = new Map(painMap);
    map.delete(painKey(view, region));
    setEntries(mapToEntries(map));
  };

  const reset = () => {
    if (entries.length === 0) return;
    if (typeof window !== "undefined" && !window.confirm("모든 통증 기록을 초기화하시겠습니까?")) return;
    setEntries([]);
  };

  /* ── Pointer events (delegated on container) ── */
  const handlePointerDown = (e: React.PointerEvent) => {
    const target = (e.target as Element).closest("[data-name]");
    const viewGroup = (e.target as Element).closest("[data-view]");
    if (!target || !viewGroup) return;
    if (e.pointerType !== "touch" && e.button !== 0) return;
    if (magnify?.active) return;

    const name = target.getAttribute("data-name") || "";
    const view = viewGroup.getAttribute("data-view") as PainView;
    const svgEl = view === "anterior" ? svgAntRef.current : svgPostRef.current;

    startPos.current = { x: e.clientX, y: e.clientY, name, view };
    isDragging.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);

    timerRef.current = setTimeout(() => {
      isDragging.current = true;
      setMagnify({
        active: true,
        x: e.clientX,
        y: e.clientY,
        targetName: name,
        view,
        svgRect: svgEl?.getBoundingClientRect() || null,
      });
      if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 데스크톱 호버 툴팁
    if (!magnify?.active && e.pointerType === "mouse") {
      const target = (e.target as Element).closest("[data-name]");
      const viewGroup = (e.target as Element).closest("[data-view]");
      if (target && viewGroup) {
        const name = target.getAttribute("data-name") || "";
        const view = viewGroup.getAttribute("data-view") as PainView;
        const level = painMap.get(painKey(view, name)) ?? 0;
        setHovered({ name, view, level, x: e.clientX, y: e.clientY });
      } else {
        setHovered(null);
      }
    }

    // long-press 취소 (이동 거리 큼)
    if (timerRef.current && !isDragging.current) {
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    // 드래그 중 (돋보기 열림): 손가락 위치 + 부위 갱신
    if (isDragging.current && magnify) {
      // 임시로 magnifier/backdrop pointer-events 끄고 elementFromPoint 로 실제 부위 찾기
      const magEl = document.getElementById("magnifier-overlay");
      const backdropEl = document.getElementById("magnifier-backdrop");
      if (magEl) magEl.style.pointerEvents = "none";
      if (backdropEl) backdropEl.style.pointerEvents = "none";

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest("[data-name]");
      const viewGroup = el?.closest("[data-view]");
      const name = target ? target.getAttribute("data-name") : magnify.targetName;
      const view = viewGroup ? (viewGroup.getAttribute("data-view") as PainView) : magnify.view;

      if (magEl) magEl.style.pointerEvents = "auto";
      if (backdropEl) backdropEl.style.pointerEvents = "auto";

      // view 가 바뀌면 svgRect 도 갱신 (전면 ↔ 후면 슬라이드)
      const svgEl = view === "anterior" ? svgAntRef.current : svgPostRef.current;
      const svgRect = svgEl?.getBoundingClientRect() || magnify.svgRect;

      setMagnify((prev) =>
        prev ? { ...prev, x: e.clientX, y: e.clientY, targetName: name, view, svgRect } : null
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isDragging.current) {
      isDragging.current = false; // 돋보기는 열린 상태 유지
    } else if (!magnify?.active) {
      // 짧은 탭 (long-press 도 드래그도 아님) → 토글
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (
        Math.hypot(dx, dy) <= DRAG_THRESHOLD &&
        startPos.current.name &&
        startPos.current.view
      ) {
        cyclePainLevel(startPos.current.view, startPos.current.name);
        if (navigator.vibrate) navigator.vibrate(15);
      }
    }
  };

  const handlePointerOut = () => {
    if (!magnify?.active) setHovered(null);
  };

  /* ── Render helpers ── */
  const renderShape = (
    shape: DiagramShape,
    view: PainView,
    name: string,
    key: string,
    interactive: boolean = true
  ) => {
    const variant: ShapeVariant = shape.deep ? "muscle-deep" : shape.bone ? "bone" : "muscle";
    const level = painMap.get(painKey(view, name)) ?? 0;
    const className = level > 0 ? `${variant} pain-${level}` : variant;
    const props: Record<string, unknown> = {
      key,
      className,
      "data-name": name,
    };
    if (interactive) {
      props.tabIndex = 0;
      props.role = "button";
      props["aria-pressed"] = level > 0;
      props["aria-label"] = name;
      props.onKeyDown = (ev: React.KeyboardEvent) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          cyclePainLevel(view, name);
        }
      };
    }
    const title = React.createElement("title", { key: "title" }, name);
    if (shape.kind === "circle") {
      return React.createElement("circle", { ...props, cx: shape.cx, cy: shape.cy, r: shape.r }, title);
    }
    return React.createElement("path", { ...props, d: smoothPath(shape.pts) }, title);
  };

  /**
   * 한쪽 절반만 저작된 도형을 direct + 미러 그룹으로 렌더링해 전신을 구성.
   * 전면: direct = 우측(화면 왼쪽) / 후면: direct = 좌측(화면 왼쪽)
   */
  const renderBodyView = (
    view: PainView,
    silD: string,
    center: CenterShape[],
    paired: PairedShape[],
    directSide: string,
    mirrorSide: string,
    interactive: boolean = true
  ) => (
    <g data-view={view}>
      <path d={silD} className="silhouette" />
      <path d={silD} className="silhouette" transform={MIRROR_TRANSFORM} />
      <g>
        {paired.map((shape, i) =>
          renderShape(shape, view, `${directSide} ${shape.base}`, `d-${i}`, interactive)
        )}
      </g>
      <g transform={MIRROR_TRANSFORM}>
        {paired.map((shape, i) =>
          renderShape(shape, view, `${mirrorSide} ${shape.base}`, `m-${i}`, interactive)
        )}
      </g>
      {center.map((shape, i) => renderShape(shape, view, shape.name, `c-${i}`, interactive))}
    </g>
  );

  const renderAnterior = (interactive = true) =>
    renderBodyView("anterior", ANT_SIL_D, ANT_CENTER, ANT_PAIRED, "우측", "좌측", interactive);

  const renderPosterior = (interactive = true) =>
    renderBodyView("posterior", POST_SIL_D, POST_CENTER, POST_PAIRED, "좌측", "우측", interactive);

  /* ── Records (정렬된 요약, 중복 제거) ── */
  const records = useMemo(() => {
    const seen = new Set<string>();
    return entries
      .filter((e) => {
        const k = painKey(e.view, e.region);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => {
        if (b.painLevel !== a.painLevel) return b.painLevel - a.painLevel;
        if (a.view !== b.view) return a.view === "anterior" ? -1 : 1;
        return a.region.localeCompare(b.region, "ko");
      });
  }, [entries]);

  return (
    <div className="w-full flex flex-col items-center select-none">
      <style>{`
        .silhouette { fill: #f1e8dd; stroke: none; pointer-events: none; }
        .muscle { fill: #e7d6c4; stroke: #a08872; stroke-width: 1.6; transition: all 0.15s ease; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
        .muscle-deep { fill: rgba(196, 174, 152, 0.45); stroke: #8a715c; stroke-width: 1.4; stroke-dasharray: 4, 3; transition: all 0.15s ease; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
        .bone { fill: #f5efe6; stroke: #b3a18c; stroke-width: 1.4; transition: all 0.15s ease; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }

        @media (hover: hover) {
          .muscle:hover, .muscle-deep:hover, .bone:hover { stroke-width: 2.8; }
          .muscle:hover { fill: #dcc6ae; }
          .muscle-deep:hover { fill: rgba(196, 174, 152, 0.7); }
          .bone:hover { fill: #ece2d2; }
        }

        .muscle:focus-visible, .muscle-deep:focus-visible, .bone:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }

        .muscle.pain-1, .muscle-deep.pain-1, .bone.pain-1 { fill: #fde047; stroke: #ca8a04; stroke-width: 3; stroke-dasharray: 0; }
        .muscle.pain-2, .muscle-deep.pain-2, .bone.pain-2 { fill: #f97316; stroke: #c2410c; stroke-width: 3.5; stroke-dasharray: 0; }
        .muscle.pain-3, .muscle-deep.pain-3, .bone.pain-3 { fill: #ef4444; stroke: #991b1b; stroke-width: 4; stroke-dasharray: 0; }

        .lr-marker { font-size: 14px; font-weight: bold; fill: #94a3b8; letter-spacing: 0.05em; pointer-events: none; }
      `}</style>

      {/* 데스크톱 호버 툴팁 */}
      {hovered && (
        <div
          className="fixed bg-slate-900/95 text-white px-3 py-1.5 rounded-lg text-sm font-medium pointer-events-none z-[100] shadow-md whitespace-nowrap dark:bg-slate-50/95 dark:text-slate-900"
          style={{ left: hovered.x, top: hovered.y - 30, transform: "translate(-50%, -100%)" }}
        >
          {hovered.name} {hovered.level > 0 && `(${PAIN_LABEL[hovered.level as PainLevel]})`}
        </div>
      )}

      {/* Header / Legend */}
      <div className="flex flex-col w-full mb-3 gap-2">
        <p className="text-xs sm:text-sm font-bold text-slate-500 px-1 dark:text-slate-400">
          📌 부위 클릭 (경도 ➔ 중등도 ➔ 중증 ➔ 취소) · 길게 누르면 돋보기
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-medium text-slate-600 bg-slate-50 p-2 sm:p-2.5 rounded-lg border border-slate-100 dark:text-slate-300 dark:bg-slate-900/50 dark:border-slate-800">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#e7d6c4] border border-[#a08872]" />
            정상
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#fde047] border border-[#ca8a04]" />
            경도(1)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#f97316] border border-[#c2410c]" />
            중등도(2)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#ef4444] border border-[#991b1b]" />
            중증(3)
          </span>
          <span className="text-slate-400 ml-auto hidden sm:inline dark:text-slate-500">· 점선 = 심부근육 · 밝은 톤 = 뼈</span>
        </div>
      </div>

      {/* Diagrams */}
      <div
        className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerOut}
        style={{
          touchAction: magnify?.active ? "none" : "auto",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        {/* Anterior */}
        <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 p-2 overflow-hidden flex flex-col items-center dark:bg-gray-800 dark:border-gray-700">
          <h2 className="absolute top-3 left-3 font-bold text-slate-300 tracking-widest uppercase text-xs dark:text-slate-600">
            Anterior
          </h2>
          <svg
            ref={svgAntRef}
            viewBox="0 0 500 950"
            className="w-full h-auto mt-3 drop-shadow-sm"
            aria-label="전면부 해부도"
          >
            <line x1={250} y1={0} x2={250} y2={950} stroke="#f1f5f9" strokeWidth={2} strokeDasharray="8,8" />
            <text x={50} y={50} className="lr-marker">R (우측)</text>
            <text x={380} y={50} className="lr-marker">L (좌측)</text>
            {renderAnterior()}
          </svg>
        </div>
        {/* Posterior */}
        <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 p-2 overflow-hidden flex flex-col items-center dark:bg-gray-800 dark:border-gray-700">
          <h2 className="absolute top-3 left-3 font-bold text-slate-300 tracking-widest uppercase text-xs dark:text-slate-600">
            Posterior
          </h2>
          <svg
            ref={svgPostRef}
            viewBox="0 0 500 950"
            className="w-full h-auto mt-3 drop-shadow-sm"
            aria-label="후면부 해부도"
          >
            <line x1={250} y1={0} x2={250} y2={950} stroke="#f1f5f9" strokeWidth={2} strokeDasharray="8,8" />
            <text x={50} y={50} className="lr-marker">L (좌측)</text>
            <text x={380} y={50} className="lr-marker">R (우측)</text>
            {renderPosterior()}
          </svg>
        </div>
      </div>

      {/* Summary chips */}
      <div className="w-full mt-4 bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="text-sm font-bold text-slate-800 mb-2 flex items-center justify-between dark:text-slate-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-indigo-600 dark:text-indigo-400" />
            기록된 부위 ({records.length})
          </div>
          {records.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-slate-400 hover:text-red-500 underline underline-offset-2"
            >
              전체 초기화
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {records.length === 0 ? (
            <span className="text-sm text-slate-400 italic">선택된 통증 부위가 없습니다.</span>
          ) : (
            records.map(({ view, region, painLevel }) => {
              const color = SEVERITY_COLOR[painLevel];
              return (
                <div
                  key={painKey(view, region)}
                  className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg text-sm dark:bg-slate-900/50 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-3 h-3 rounded-full border shrink-0 ${color.tw}`} />
                    <span className="text-xs text-slate-400 shrink-0">[{view === "anterior" ? "전면" : "후면"}]</span>
                    <span className="font-semibold text-slate-700 truncate dark:text-slate-200">{region}</span>
                    <span className="text-xs text-slate-500 shrink-0 dark:text-slate-400">({PAIN_LABEL[painLevel]})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(view, region)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-1 shrink-0"
                    aria-label={`${region} 선택 취소`}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Magnifier */}
      {magnify?.active && (
        <>
          <div
            id="magnifier-backdrop"
            className="fixed inset-0 z-[150]"
            onClick={() => setMagnify(null)}
            onTouchEnd={(e) => {
              e.preventDefault();
              setMagnify(null);
            }}
          />
          <div
            id="magnifier-overlay"
            className="fixed z-[160] rounded-full border-4 border-indigo-500 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden pointer-events-auto dark:bg-gray-800"
            style={{
              width: LENS_PX,
              height: LENS_PX,
              left: magnify.x,
              top: magnify.y + LENS_OFFSET_Y,
              transform: "translate(-50%, -50%)",
              touchAction: "none",
            }}
            onClick={() => {
              if (magnify.targetName && magnify.view) {
                cyclePainLevel(magnify.view, magnify.targetName);
                if (navigator.vibrate) navigator.vibrate(15);
              }
            }}
          >
            {/* 십자선 */}
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center opacity-30">
              <div className="w-3 h-3 border-2 border-indigo-500 rounded-full" />
              <div className="absolute w-full h-[1px] bg-indigo-500" />
              <div className="absolute h-full w-[1px] bg-indigo-500" />
            </div>
            {/* 확대된 SVG */}
            <div
              className="absolute pointer-events-none"
              style={{
                width: magnify.svgRect?.width,
                height: magnify.svgRect?.height,
                left: magnify.svgRect ? LENS_HALF - (magnify.x - magnify.svgRect.left) * LENS_ZOOM : 0,
                top: magnify.svgRect ? LENS_HALF - (magnify.y - magnify.svgRect.top) * LENS_ZOOM : 0,
                transform: `scale(${LENS_ZOOM})`,
                transformOrigin: "top left",
              }}
            >
              <svg viewBox="0 0 500 950" className="w-full h-full drop-shadow-sm" aria-hidden="true">
                {magnify.view === "posterior" ? renderPosterior(false) : renderAnterior(false)}
              </svg>
            </div>
            {/* 부위 라벨 */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-3 py-1 rounded-full text-xs whitespace-nowrap font-bold pointer-events-none shadow-lg max-w-[80%] truncate dark:bg-slate-50/90 dark:text-slate-900">
              {magnify.targetName || "—"}
              {magnify.targetName &&
                magnify.view &&
                painMap.get(painKey(magnify.view, magnify.targetName)) && (
                  <span className="ml-1 text-yellow-400">
                    ({PAIN_LABEL[painMap.get(painKey(magnify.view, magnify.targetName))!]})
                  </span>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
