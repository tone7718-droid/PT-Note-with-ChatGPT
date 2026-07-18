import type { NoteData, Therapist, TherapistRecord } from "@/types";

export type SidebarSortBy = "newest" | "oldest" | "patientName";

export interface SidebarFilters {
  search?: string;
  therapistUid?: string;
  startDate?: string;
  endDate?: string;
  sortBy: SidebarSortBy;
}

export function getVisibleSidebarNotes({
  notes,
  therapist,
}: {
  notes: NoteData[];
  /** 시그니처 호환용 — master 전체 열람 정책 이후 필터링에는 사용하지 않음 */
  therapists?: TherapistRecord[];
  therapist: Therapist | null;
}): NoteData[] {
  // master 는 퇴사한 치료사의 노트를 포함해 전체 의무기록을 본다
  // (이관 전이라도 임상 기록이 목록에서 사라지면 안 됨)
  if (therapist?.role === "master") return notes;
  return notes.filter((note) => {
    if (therapist) return note.therapistUid === therapist.uid || !note.therapistUid;
    return true;
  });
}

export function filterAndSortSidebarNotes(
  notes: NoteData[],
  filters: SidebarFilters
): NoteData[] {
  const search = normalize(filters.search);
  const therapistUid = filters.therapistUid && filters.therapistUid !== "all" ? filters.therapistUid : "";
  const startTime = filters.startDate ? getStartOfDay(filters.startDate) : null;
  const endTime = filters.endDate ? getEndOfDay(filters.endDate) : null;

  return notes
    .filter((note) => {
      const matchesSearch =
        !search ||
        normalize(note.patientName).includes(search) ||
        normalize(note.diagnosis).includes(search) ||
        normalize(note.chartNo).includes(search);
      const matchesTherapist = !therapistUid || note.therapistUid === therapistUid;
      const noteTime = getFilterTime(note);
      const matchesStartDate = startTime === null || noteTime >= startTime;
      const matchesEndDate = endTime === null || noteTime <= endTime;
      return matchesSearch && matchesTherapist && matchesStartDate && matchesEndDate;
    })
    .sort((a, b) => compareNotes(a, b, filters.sortBy));
}

export function hasActiveSidebarFilters(filters: SidebarFilters): boolean {
  return Boolean(
    filters.search?.trim() ||
      (filters.therapistUid && filters.therapistUid !== "all") ||
      filters.startDate ||
      filters.endDate ||
      filters.sortBy !== "newest"
  );
}

function compareNotes(a: NoteData, b: NoteData, sortBy: SidebarSortBy): number {
  if (sortBy === "oldest") return getNoteTime(a) - getNoteTime(b) || getSavedTime(a) - getSavedTime(b);
  if (sortBy === "patientName") {
    const byName = (a.patientName || "").localeCompare(b.patientName || "", "ko");
    if (byName !== 0) return byName;
  }
  return getNoteTime(b) - getNoteTime(a) || getSavedTime(b) - getSavedTime(a);
}

/** 같은 시술일 노트의 보조 정렬용 저장 시각 */
function getSavedTime(note: NoteData): number {
  const time = new Date(note.savedAt || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function getNoteTime(note: NoteData): number {
  // 시술일(noteDate) 우선 — 옛 노트를 수정해도(savedAt 갱신) 목록 순서가
  // 시술 시점 기준으로 유지되도록. noteDate 가 없는 구노트만 savedAt 사용.
  const value = note.noteDate || note.savedAt || "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getFilterTime(note: NoteData): number {
  const value = note.noteDate || note.savedAt || "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getStartOfDay(date: string): number {
  return new Date(`${date}T00:00:00`).getTime();
}

function getEndOfDay(date: string): number {
  return new Date(`${date}T23:59:59.999`).getTime();
}

function normalize(value?: string): string {
  return (value ?? "").trim().toLocaleLowerCase("ko-KR");
}
