"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { PainEntry, PainLevel, PainView } from "@/types";

/* ════════════════════════════════════════════════════════
   Body Diagram (Clinical Pain Map)
   - Antigravity 시안 + view 분리 (anterior/posterior) + 그룹 토글
   - 길게 누르기 → 돋보기 (1.5x), 손가락 추적 (elementFromPoint)
   - 데스크톱 호버 툴팁
   - 단일 부위 데이터 (ANT_PARTS / POST_PARTS) — 메인 SVG·돋보기 공유
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
const LENS_OFFSET_Y = -130; // 손가락 위쪽으로 띄움
const LONG_PRESS_MS = 400;
const DRAG_THRESHOLD = 10;

/* ─────────────────────────────────────────
   Part data (single source of truth)
   ───────────────────────────────────────── */
type PathSpec = {
  type: "ellipse" | "circle" | "polygon" | "rect" | "path";
  name: string;
  deep?: boolean;
  group?: string;
  attrs: Record<string, string | number>;
};

const ANT_PARTS: PathSpec[] = [
  { type: "ellipse", name: "머리 및 안면", attrs: { cx: 250, cy: 70, rx: 40, ry: 55 } },
  { type: "circle", name: "우측 턱관절 (TMJ)", attrs: { cx: 220, cy: 90, r: 12 } },
  { type: "circle", name: "좌측 턱관절 (TMJ)", attrs: { cx: 280, cy: 90, r: 12 } },
  { type: "polygon", name: "우측 흉쇄유돌근", attrs: { points: "215,105 225,105 245,145 235,145" } },
  { type: "polygon", name: "좌측 흉쇄유돌근", attrs: { points: "275,105 285,105 265,145 255,145" } },
  { type: "rect", name: "흉골", attrs: { x: 246, y: 150, width: 8, height: 70, rx: 4 } },
  { type: "polygon", name: "우측 대흉근", attrs: { points: "246,150 180,150 160,220 246,230" } },
  { type: "polygon", name: "좌측 대흉근", attrs: { points: "254,150 320,150 340,220 254,230" } },
  { type: "polygon", name: "우측 소흉근 (심부)", deep: true, attrs: { points: "225,155 185,175 200,205" } },
  { type: "polygon", name: "좌측 소흉근 (심부)", deep: true, attrs: { points: "275,155 315,175 300,205" } },
  { type: "polygon", name: "우측 전면 삼각근", attrs: { points: "180,150 160,160 145,230 160,220" } },
  { type: "polygon", name: "우측 측면 삼각근", attrs: { points: "160,160 140,170 130,240 145,230" } },
  { type: "polygon", name: "좌측 전면 삼각근", attrs: { points: "320,150 340,160 355,230 340,220" } },
  { type: "polygon", name: "좌측 측면 삼각근", attrs: { points: "340,160 360,170 370,240 355,230" } },
  { type: "polygon", name: "우측 이두근", attrs: { points: "130,240 110,330 140,330 160,220" } },
  { type: "polygon", name: "좌측 이두근", attrs: { points: "370,240 390,330 360,330 340,220" } },
  { type: "circle", name: "우측 안쪽 상과", attrs: { cx: 145, cy: 335, r: 10 } },
  { type: "circle", name: "좌측 안쪽 상과", attrs: { cx: 355, cy: 335, r: 10 } },
  { type: "polygon", name: "우측 안쪽 전완", attrs: { points: "140,340 120,440 140,440 150,340" } },
  { type: "polygon", name: "우측 가쪽 전완", attrs: { points: "110,340 90,440 120,440 130,340" } },
  { type: "polygon", name: "좌측 안쪽 전완", attrs: { points: "360,340 380,440 360,440 350,340" } },
  { type: "polygon", name: "좌측 가쪽 전완", attrs: { points: "390,340 410,440 380,440 370,340" } },
  { type: "polygon", name: "우측 손", attrs: { points: "90,450 70,520 110,520 120,450" } },
  { type: "polygon", name: "좌측 손", attrs: { points: "410,450 430,520 390,520 380,450" } },
  // Rectus abdominis (6칸 그룹 토글)
  { type: "rect", name: "복직근", group: "rectus", attrs: { x: 215, y: 235, width: 33, height: 35, rx: 5 } },
  { type: "rect", name: "복직근", group: "rectus", attrs: { x: 252, y: 235, width: 33, height: 35, rx: 5 } },
  { type: "rect", name: "복직근", group: "rectus", attrs: { x: 218, y: 275, width: 30, height: 40, rx: 5 } },
  { type: "rect", name: "복직근", group: "rectus", attrs: { x: 252, y: 275, width: 30, height: 40, rx: 5 } },
  { type: "rect", name: "복직근", group: "rectus", attrs: { x: 222, y: 320, width: 26, height: 45, rx: 5 } },
  { type: "rect", name: "복직근", group: "rectus", attrs: { x: 252, y: 320, width: 26, height: 45, rx: 5 } },
  { type: "polygon", name: "우측 전거근", attrs: { points: "185,230 155,240 170,280 210,270" } },
  { type: "polygon", name: "좌측 전거근", attrs: { points: "315,230 345,240 330,280 290,270" } },
  { type: "polygon", name: "우측 복사근", attrs: { points: "210,275 165,285 180,360 220,360" } },
  { type: "polygon", name: "좌측 복사근", attrs: { points: "290,275 335,285 320,360 280,360" } },
  { type: "polygon", name: "우측 장요근 (심부)", deep: true, attrs: { points: "248,365 230,365 235,440 248,430" } },
  { type: "polygon", name: "좌측 장요근 (심부)", deep: true, attrs: { points: "252,365 270,365 265,440 252,430" } },
  { type: "circle", name: "우측 골반뼈 (ASIS)", attrs: { cx: 195, cy: 380, r: 12 } },
  { type: "circle", name: "좌측 골반뼈 (ASIS)", attrs: { cx: 305, cy: 380, r: 12 } },
  { type: "polygon", name: "우측 서혜부", attrs: { points: "195,375 190,385 235,445 240,435" } },
  { type: "polygon", name: "좌측 서혜부", attrs: { points: "305,375 310,385 265,445 260,435" } },
  { type: "polygon", name: "우측 대퇴사두근", attrs: { points: "245,435 195,400 160,480 180,650 240,650" } },
  { type: "polygon", name: "좌측 대퇴사두근", attrs: { points: "255,435 305,400 340,480 320,650 260,650" } },
  { type: "polygon", name: "우측 장경인대", attrs: { points: "160,480 145,530 170,650 180,650" } },
  { type: "polygon", name: "좌측 장경인대", attrs: { points: "340,480 355,530 330,650 320,650" } },
  { type: "circle", name: "우측 무릎뼈 (Patella)", attrs: { cx: 210, cy: 675, r: 22 } },
  { type: "circle", name: "좌측 무릎뼈 (Patella)", attrs: { cx: 290, cy: 675, r: 22 } },
  { type: "polygon", name: "우측 정강이뼈", attrs: { points: "210,700 205,700 195,830 205,830" } },
  { type: "polygon", name: "우측 전경골근", attrs: { points: "205,700 170,700 185,830 195,830" } },
  { type: "polygon", name: "우측 안쪽 종아리", attrs: { points: "235,700 215,700 205,830 220,830" } },
  { type: "polygon", name: "좌측 정강이뼈", attrs: { points: "290,700 295,700 305,830 295,830" } },
  { type: "polygon", name: "좌측 전경골근", attrs: { points: "295,700 330,700 315,830 305,830" } },
  { type: "polygon", name: "좌측 안쪽 종아리", attrs: { points: "265,700 285,700 295,830 280,830" } },
  { type: "polygon", name: "우측 발등", attrs: { points: "215,845 180,845 185,920 230,920" } },
  { type: "polygon", name: "좌측 발등", attrs: { points: "285,845 320,845 315,920 270,920" } },
];

const POST_PARTS: PathSpec[] = [
  { type: "ellipse", name: "머리 뒤통수", attrs: { cx: 250, cy: 70, rx: 40, ry: 55 } },
  { type: "rect", name: "경추", attrs: { x: 247, y: 110, width: 6, height: 35, rx: 3 } },
  { type: "rect", name: "흉추", attrs: { x: 247, y: 150, width: 6, height: 170, rx: 3 } },
  { type: "rect", name: "요추", attrs: { x: 247, y: 325, width: 6, height: 50, rx: 3 } },
  { type: "polygon", name: "천골", attrs: { points: "250,380 242,385 250,420 258,385" } },
  { type: "rect", name: "좌측 후두하근 (심부)", deep: true, attrs: { x: 225, y: 110, width: 20, height: 20, rx: 4 } },
  { type: "rect", name: "우측 후두하근 (심부)", deep: true, attrs: { x: 255, y: 110, width: 20, height: 20, rx: 4 } },
  { type: "polygon", name: "좌측 목 근육", deep: true, attrs: { points: "245,135 225,135 230,160 245,160" } },
  { type: "polygon", name: "우측 목 근육", deep: true, attrs: { points: "255,135 275,135 270,160 255,160" } },
  { type: "polygon", name: "좌측 상부승모근", attrs: { points: "245,145 200,155 170,165 245,185" } },
  { type: "polygon", name: "우측 상부승모근", attrs: { points: "255,145 300,155 330,165 255,185" } },
  { type: "circle", name: "좌측 견갑골 상각", attrs: { cx: 195, cy: 165, r: 10 } },
  { type: "polygon", name: "좌측 견갑골 내측연", attrs: { points: "215,170 220,230 195,230 190,170" } },
  { type: "circle", name: "좌측 견갑골 하각", attrs: { cx: 205, cy: 240, r: 10 } },
  { type: "polygon", name: "좌측 극상근", attrs: { points: "190,165 155,170 165,185 195,180" } },
  { type: "polygon", name: "좌측 극하근", attrs: { points: "195,180 160,190 175,230 195,230" } },
  { type: "circle", name: "우측 견갑골 상각", attrs: { cx: 305, cy: 165, r: 10 } },
  { type: "polygon", name: "우측 견갑골 내측연", attrs: { points: "285,170 280,230 305,230 310,170" } },
  { type: "circle", name: "우측 견갑골 하각", attrs: { cx: 295, cy: 240, r: 10 } },
  { type: "polygon", name: "우측 극상근", attrs: { points: "310,165 345,170 335,185 305,180" } },
  { type: "polygon", name: "우측 극하근", attrs: { points: "305,180 340,190 325,230 305,230" } },
  { type: "polygon", name: "좌측 후면 삼각근", attrs: { points: "160,165 140,180 150,230 170,190" } },
  { type: "polygon", name: "우측 후면 삼각근", attrs: { points: "340,165 360,180 350,230 330,190" } },
  { type: "polygon", name: "좌측 삼두근", attrs: { points: "150,230 120,330 150,330 170,230" } },
  { type: "polygon", name: "우측 삼두근", attrs: { points: "350,230 380,330 350,330 330,230" } },
  { type: "circle", name: "좌측 가쪽 상과", attrs: { cx: 120, cy: 335, r: 10 } },
  { type: "circle", name: "우측 가쪽 상과", attrs: { cx: 380, cy: 335, r: 10 } },
  { type: "polygon", name: "좌측 안쪽 전완", attrs: { points: "150,340 130,440 150,440 160,340" } },
  { type: "polygon", name: "좌측 가쪽 전완", attrs: { points: "120,340 100,440 130,440 140,340" } },
  { type: "polygon", name: "우측 안쪽 전완", attrs: { points: "350,340 370,440 350,440 340,340" } },
  { type: "polygon", name: "우측 가쪽 전완", attrs: { points: "380,340 400,440 370,440 360,340" } },
  { type: "polygon", name: "좌측 손등", attrs: { points: "100,450 80,520 120,520 130,450" } },
  { type: "polygon", name: "우측 손등", attrs: { points: "400,450 420,520 380,520 370,450" } },
  { type: "polygon", name: "좌측 광배근", attrs: { points: "245,190 205,240 165,290 245,340" } },
  { type: "polygon", name: "우측 광배근", attrs: { points: "255,190 295,240 335,290 255,340" } },
  { type: "rect", name: "좌측 흉요추 기립근", deep: true, attrs: { x: 230, y: 190, width: 14, height: 135, rx: 4 } },
  { type: "rect", name: "우측 흉요추 기립근", deep: true, attrs: { x: 256, y: 190, width: 14, height: 135, rx: 4 } },
  { type: "polygon", name: "좌측 요방형근 (심부)", deep: true, attrs: { points: "245,330 215,335 220,370 245,370" } },
  { type: "polygon", name: "우측 요방형근 (심부)", deep: true, attrs: { points: "255,330 285,335 280,370 255,370" } },
  { type: "circle", name: "좌측 PSIS", attrs: { cx: 225, cy: 380, r: 10 } },
  { type: "circle", name: "우측 PSIS", attrs: { cx: 275, cy: 380, r: 10 } },
  { type: "polygon", name: "좌측 중둔근", attrs: { points: "215,370 170,390 185,420 220,395" } },
  { type: "polygon", name: "우측 중둔근", attrs: { points: "285,370 330,390 315,420 280,395" } },
  { type: "path", name: "좌측 대둔근", attrs: { d: "M 245,385 L 210,395 L 170,460 L 245,475 Z M 215,420 A 12 12 0 1 0 215 444 A 12 12 0 1 0 215 420 Z", fillRule: "evenodd" } },
  { type: "circle", name: "좌측 이상근 (심부)", deep: true, attrs: { cx: 215, cy: 432, r: 12 } },
  { type: "path", name: "우측 대둔근", attrs: { d: "M 255,385 L 290,395 L 330,460 L 255,475 Z M 285,420 A 12 12 0 1 0 285 444 A 12 12 0 1 0 285 420 Z", fillRule: "evenodd" } },
  { type: "circle", name: "우측 이상근 (심부)", deep: true, attrs: { cx: 285, cy: 432, r: 12 } },
  { type: "polygon", name: "좌측 안쪽 햄스트링", attrs: { points: "242,480 210,480 220,660 238,660" } },
  { type: "polygon", name: "좌측 가쪽 햄스트링", attrs: { points: "205,480 175,480 195,660 215,660" } },
  { type: "polygon", name: "우측 안쪽 햄스트링", attrs: { points: "258,480 290,480 280,660 262,660" } },
  { type: "polygon", name: "우측 가쪽 햄스트링", attrs: { points: "295,480 325,480 305,660 285,660" } },
  { type: "ellipse", name: "좌측 오금", deep: true, attrs: { cx: 220, cy: 675, rx: 18, ry: 12 } },
  { type: "ellipse", name: "우측 오금", deep: true, attrs: { cx: 280, cy: 675, rx: 18, ry: 12 } },
  { type: "polygon", name: "좌측 안쪽 종아리", attrs: { points: "238,690 220,690 215,800 230,800" } },
  { type: "polygon", name: "좌측 가쪽 종아리", attrs: { points: "215,690 190,690 205,800 210,800" } },
  { type: "polygon", name: "우측 안쪽 종아리", attrs: { points: "262,690 280,690 285,800 270,800" } },
  { type: "polygon", name: "우측 가쪽 종아리", attrs: { points: "285,690 310,690 295,800 290,800" } },
  { type: "polygon", name: "좌측 아킬레스건", attrs: { points: "225,805 210,805 210,860 225,860" } },
  { type: "polygon", name: "우측 아킬레스건", attrs: { points: "275,805 290,805 290,860 275,860" } },
  { type: "polygon", name: "좌측 발뒤꿈치", attrs: { points: "230,870 205,870 200,890 235,890" } },
  { type: "polygon", name: "좌측 앞발바닥", attrs: { points: "235,890 200,890 195,930 240,930" } },
  { type: "polygon", name: "우측 발뒤꿈치", attrs: { points: "270,870 295,870 300,890 265,890" } },
  { type: "polygon", name: "우측 앞발바닥", attrs: { points: "265,890 300,890 305,930 260,930" } },
];

/* ─────────────────────────────────────────
   Pain map helpers (PainEntry[] ↔ Map)
   ───────────────────────────────────────── */
type PainKey = string;
const painKey = (view: PainView, name: string): PainKey => `${view}::${name}`;

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

/* ─────────────────────────────────────────
   Component
   ───────────────────────────────────────── */
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
    group: null as string | null,
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

  const cyclePainLevel = (view: PainView, name: string, group?: string | null) => {
    const partsOfView = view === "anterior" ? ANT_PARTS : POST_PARTS;
    const targets = group
      ? partsOfView.filter((p) => p.group === group).map((p) => p.name)
      : [name];
    const firstKey = painKey(view, targets[0]);
    const cur = painMap.get(firstKey) ?? 0;
    const next = ((cur + 1) % 4) as 0 | PainLevel;

    const map = new Map(painMap);
    for (const t of targets) {
      const k = painKey(view, t);
      if (next === 0) map.delete(k);
      else map.set(k, next as PainLevel);
    }
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
    const group = target.getAttribute("data-group");
    const svgEl = view === "anterior" ? svgAntRef.current : svgPostRef.current;

    startPos.current = { x: e.clientX, y: e.clientY, name, view, group };
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
        cyclePainLevel(startPos.current.view, startPos.current.name, startPos.current.group);
        if (navigator.vibrate) navigator.vibrate(15);
      }
    }
  };

  const handlePointerOut = () => {
    if (!magnify?.active) setHovered(null);
  };

  /* ── Render helpers ── */
  const renderPart = (p: PathSpec, idx: number, view: PainView, interactive: boolean = true) => {
    const level = painMap.get(painKey(view, p.name)) ?? 0;
    const baseClass = p.deep ? "muscle-deep" : "muscle";
    const className = level > 0 ? `${baseClass} pain-${level}` : baseClass;
    const props: Record<string, unknown> = {
      key: idx,
      ...p.attrs,
      className,
      "data-name": p.name,
    };
    if (p.group) props["data-group"] = p.group;
    if (interactive) {
      props.tabIndex = 0;
      props.role = "button";
      props["aria-pressed"] = level > 0 ? "true" : "false";
      props["aria-label"] = p.name;
      props.onKeyDown = (ev: React.KeyboardEvent) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          cyclePainLevel(view, p.name, p.group);
        }
      };
    }
    return React.createElement(p.type, props, React.createElement("title", null, p.name));
  };

  /* ── Records (정렬된 요약) ── */
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
        .muscle { fill: #e2e8f0; stroke: #64748b; stroke-width: 2; transition: all 0.15s ease; cursor: pointer; outline: none; }
        .muscle-deep { fill: rgba(203, 213, 225, 0.5); stroke: #475569; stroke-width: 2; stroke-dasharray: 4, 3; transition: all 0.15s ease; cursor: pointer; outline: none; }
        @media (hover: hover) {
          .muscle:hover, .muscle-deep:hover { stroke-width: 3; }
          .muscle:hover { fill: #cbd5e1; }
          .muscle-deep:hover { fill: rgba(148, 163, 184, 0.8); }
        }
        .muscle.pain-1, .muscle-deep.pain-1 { fill: #fde047; stroke: #ca8a04; stroke-width: 3; stroke-dasharray: 0; }
        .muscle.pain-2, .muscle-deep.pain-2 { fill: #f97316; stroke: #c2410c; stroke-width: 3.5; stroke-dasharray: 0; }
        .muscle.pain-3, .muscle-deep.pain-3 { fill: #ef4444; stroke: #991b1b; stroke-width: 4; stroke-dasharray: 0; }
        .lr-marker { font-size: 14px; font-weight: bold; fill: #94a3b8; letter-spacing: 0.05em; pointer-events: none; }
      `}</style>

      {/* 데스크톱 호버 툴팁 */}
      {hovered && (
        <div
          className="fixed bg-slate-900/95 text-white px-3 py-1.5 rounded-lg text-sm font-medium pointer-events-none z-[100] shadow-md whitespace-nowrap"
          style={{ left: hovered.x, top: hovered.y - 30, transform: "translate(-50%, -100%)" }}
        >
          {hovered.name} {hovered.level > 0 && `(${PAIN_LABEL[hovered.level as PainLevel]})`}
        </div>
      )}

      {/* Header / Legend */}
      <div className="flex flex-col w-full mb-3 gap-2">
        <p className="text-xs sm:text-sm font-bold text-slate-500 px-1">
          📌 부위 클릭 (경도 ➔ 중등도 ➔ 중증 ➔ 취소) · 길게 누르면 돋보기
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-medium text-slate-600 bg-slate-50 p-2 sm:p-2.5 rounded-lg border border-slate-100">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#e2e8f0] border border-[#64748b]" />
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
          <span className="text-slate-400 ml-auto hidden sm:inline">· 점선 = 심부근육</span>
        </div>
      </div>

      {/* Diagrams */}
      <div
        className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerOut}
        style={{ touchAction: magnify?.active ? "none" : "auto" }}
      >
        {/* Anterior */}
        <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 p-2 overflow-hidden flex flex-col items-center">
          <h2 className="absolute top-3 left-3 font-bold text-slate-300 tracking-widest uppercase text-xs">
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
            <g data-view="anterior">
              {ANT_PARTS.map((p, i) => renderPart(p, i, "anterior"))}
            </g>
          </svg>
        </div>
        {/* Posterior */}
        <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 p-2 overflow-hidden flex flex-col items-center">
          <h2 className="absolute top-3 left-3 font-bold text-slate-300 tracking-widest uppercase text-xs">
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
            <g data-view="posterior">
              {POST_PARTS.map((p, i) => renderPart(p, i, "posterior"))}
            </g>
          </svg>
        </div>
      </div>

      {/* Summary chips */}
      <div className="w-full mt-4 bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-800 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-indigo-600" />
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
                  className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-3 h-3 rounded-full border shrink-0 ${color.tw}`} />
                    <span className="text-xs text-slate-400 shrink-0">[{view === "anterior" ? "전면" : "후면"}]</span>
                    <span className="font-semibold text-slate-700 truncate">{region}</span>
                    <span className="text-xs text-slate-500 shrink-0">({PAIN_LABEL[painLevel]})</span>
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
            className="fixed z-[160] rounded-full border-4 border-indigo-500 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden pointer-events-auto"
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
              <svg viewBox="0 0 500 950" className="w-full h-full" aria-hidden="true">
                <g data-view={magnify.view ?? "anterior"}>
                  {(magnify.view === "anterior" ? ANT_PARTS : POST_PARTS).map((p, i) =>
                    renderPart(p, i, magnify.view ?? "anterior", false)
                  )}
                </g>
              </svg>
            </div>
            {/* 부위 라벨 */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-3 py-1 rounded-full text-xs whitespace-nowrap font-bold pointer-events-none shadow-lg max-w-[80%] truncate">
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
