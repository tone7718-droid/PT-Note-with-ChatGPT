/**
 * 자동 임시 저장 (Draft) — 새 노트 작성 중에 5초마다 호출됨.
 * 사용자가 실수로 [취소] / [새 노트 작성] 을 눌러도 마지막 5초 이내 작업 복구 가능.
 *
 * 저장 위치: localStorage["pt_draft_note"]
 * 저장 데이터: NoteData (id, savedAt 제외) + draftSavedAt 타임스탬프
 *              — 환자정보가 포함되므로 노트 본문과 동일하게 AES-GCM 암호화 저장.
 *
 * 정상 저장 (저장 버튼) 시 → clearDraft() 호출하여 자동 정리됨.
 */

import type { NoteData } from "@/types";
import { encryptData, decryptData } from "@/lib/cryptoService";

const DRAFT_KEY = "pt_draft_note";

export type DraftNoteData = Omit<NoteData, "id" | "savedAt"> & {
  draftSavedAt: string;
};

export async function loadDraft(): Promise<DraftNoteData | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    let json: string;
    try {
      json = await decryptData(raw);
    } catch {
      json = raw; // 암호화 전 평문 draft 폴백 (다음 saveDraft 때 암호화됨)
    }
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as DraftNoteData;
  } catch {
    return null;
  }
}

export async function saveDraft(data: Omit<NoteData, "id" | "savedAt">): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const draft: DraftNoteData = { ...data, draftSavedAt: new Date().toISOString() };
    window.localStorage.setItem(DRAFT_KEY, await encryptData(JSON.stringify(draft)));
  } catch {
    // localStorage 쿼터 초과 등 — 조용히 실패
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** 폼이 "비어있지 않은지" 검사 (의미있는 내용이 있는지) */
export function isNoteContentful(data: Partial<Omit<NoteData, "id" | "savedAt">>): boolean {
  if (!data) return false;
  if (data.patientName?.trim()) return true;
  if (data.chartNo?.trim()) return true;
  if (data.birthDate?.trim()) return true;
  if (data.diagnosis?.trim()) return true;
  if (data.pmh?.trim()) return true;
  if (data.chiefComplaint?.trim()) return true;
  if (data.postural?.trim()) return true;
  if (data.palpation?.trim()) return true;
  if (data.specialTest?.trim()) return true;
  if (data.treatment?.trim()) return true;
  if (data.assessment?.trim()) return true;
  if (data.homeExercise?.trim()) return true;
  if (data.plan?.trim()) return true;
  if (typeof data.painScore === "number") return true;
  if (typeof data.painScoreAfter === "number") return true;
  if (Array.isArray(data.painAreas) && data.painAreas.length > 0) return true;
  if (Array.isArray(data.rom) && data.rom.some((r) => r.joint?.trim() || r.measuredROM?.trim())) return true;
  return false;
}

/** "방금 전" / "5분 전" / "2시간 전" / "2026-05-03" */
export function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 30_000) return "방금 전";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}초 전`;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
