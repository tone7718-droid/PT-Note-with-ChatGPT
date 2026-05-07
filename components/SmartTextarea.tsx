"use client";

import * as React from "react";
import { Textarea, type TextareaProps } from "@/components/ui/Textarea";
import { detectMacroTrigger, loadMacros, MACRO_SLOT_COUNT } from "@/lib/macros";

/**
 * Textarea 에 매크로 자동 완성 (/도수1~20) 기능을 덧붙인 wrapper.
 * 사용법: <SmartTextarea {...register("postural")} placeholder="..." />
 *
 * react-hook-form 의 register() 가 ref/onChange 등을 주는데, 여기서는
 * value 를 직접 수정해야 하므로 ref 와 onChange 를 합성해서 처리.
 */
export interface SmartTextareaProps extends TextareaProps {
  /** react-hook-form 등 외부 onChange 콜백 */
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
}

export const SmartTextarea = React.forwardRef<HTMLTextAreaElement, SmartTextareaProps>(
  ({ onChange, isPdfMode, ...props }, externalRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [macros, setMacros] = React.useState<string[]>(() =>
      typeof window !== "undefined" ? loadMacros() : Array(MACRO_SLOT_COUNT).fill("")
    );
    const [trigger, setTrigger] = React.useState<{ start: number; end: number; slot: number | null } | null>(null);
    const [highlight, setHighlight] = React.useState<number>(0);
    const popupRef = React.useRef<HTMLDivElement | null>(null);

    // 매크로 변경 이벤트 — 다른 곳(관리 모달)에서 저장 시 갱신
    React.useEffect(() => {
      const onStorage = () => setMacros(loadMacros());
      window.addEventListener("storage", onStorage);
      window.addEventListener("pt-macros-updated", onStorage);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("pt-macros-updated", onStorage);
      };
    }, []);

    // ref 합성
    const setRef = (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof externalRef === "function") externalRef(el);
      else if (externalRef) (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    };

    const detect = (el: HTMLTextAreaElement) => {
      const t = detectMacroTrigger(el.value, el.selectionStart);
      setTrigger(t);
      if (t?.slot && macros[t.slot - 1]) {
        // 슬롯 번호 정확히 입력 → 해당 슬롯에 하이라이트
        setHighlight(t.slot - 1);
      } else {
        setHighlight(0);
      }
    };

    const insert = (slotIndex: number) => {
      if (!innerRef.current || !trigger) return;
      const content = macros[slotIndex];
      if (!content) return;
      const el = innerRef.current;
      const before = el.value.slice(0, trigger.start);
      const after = el.value.slice(trigger.end);
      const newValue = before + content + after;
      // react-hook-form 호환: 네이티브 setter + input 이벤트
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
      desc.set!.call(el, newValue);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      // 커서 위치
      const newCursor = before.length + content.length;
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = newCursor;
      });
      setTrigger(null);
    };

    // 표시할 후보 (슬롯 번호 + 첫 줄 미리보기)
    const candidates = macros
      .map((v, i) => ({ idx: i, slot: i + 1, content: v }))
      .filter((c) => c.content.length > 0);

    // 키보드 처리
    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!trigger) return;
      // 후보가 없으면 키 처리 안 함 (단, ESC 로는 닫음)
      if (e.key === "Escape") {
        setTrigger(null);
        return;
      }
      if (candidates.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % candidates.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + candidates.length) % candidates.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        // 슬롯 번호 정확히 매치되면 그 슬롯, 아니면 highlight 슬롯
        if (trigger.slot && macros[trigger.slot - 1]) {
          insert(trigger.slot - 1);
        } else {
          insert(candidates[highlight].idx);
        }
      }
    };

    // 외부 클릭 시 팝업 닫기
    React.useEffect(() => {
      if (!trigger) return;
      const onClick = (e: MouseEvent) => {
        if (popupRef.current?.contains(e.target as Node)) return;
        if (innerRef.current === e.target) return;
        setTrigger(null);
      };
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }, [trigger]);

    return (
      <div className="relative">
        <Textarea
          {...props}
          ref={setRef}
          isPdfMode={isPdfMode}
          onChange={(e) => {
            onChange?.(e);
            detect(e.currentTarget);
          }}
          onKeyDown={(e) => {
            onKeyDown(e);
            props.onKeyDown?.(e);
          }}
          onClick={(e) => {
            detect(e.currentTarget);
            props.onClick?.(e);
          }}
          onBlur={(e) => {
            // blur 시 약간 지연 후 닫기 (팝업 클릭 허용)
            setTimeout(() => setTrigger(null), 150);
            props.onBlur?.(e);
          }}
        />

        {trigger && !isPdfMode && (
          <div
            ref={popupRef}
            className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 text-sm dark:bg-slate-900 dark:border-slate-700"
            role="listbox"
            aria-label="도수치료 매크로 후보"
          >
            {candidates.length === 0 ? (
              <div className="px-4 py-3 text-gray-500 dark:text-slate-400">
                <div className="font-bold text-gray-700 mb-0.5 dark:text-slate-200">등록된 도수치료 매크로가 없습니다.</div>
                <div className="text-xs">사이드바 메뉴 → &quot;매크로 관리&quot; 에서 1~20번 슬롯에 자주 쓰는 문구를 등록하세요.</div>
              </div>
            ) : (
              candidates.map((c, i) => {
                const isActive = i === highlight;
                return (
                  <button
                    key={c.slot}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insert(c.idx);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 border-b border-gray-50 last:border-b-0 transition-colors dark:border-slate-800 ${isActive ? "bg-blue-50 dark:bg-blue-950/50" : "hover:bg-gray-50 dark:hover:bg-slate-800"}`}
                  >
                    <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold ${isActive ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                      /도수{c.slot}
                    </span>
                    <span className="text-gray-700 line-clamp-2 break-words text-xs sm:text-sm dark:text-slate-200">{c.content}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }
);
SmartTextarea.displayName = "SmartTextarea";
