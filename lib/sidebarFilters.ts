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
  therapists,
  therapist,
}: {
  notes: NoteData[];
  therapists: TherapistRecord[];
  therapist: Therapist | null;
}): NoteData[] {
  const isMaster = therapist?.role === "master";
  return notes.filter((note) => {
    if (isMaster) {
      const isResigned = therapists.some((t) => t.resigned && t.uid === note.therapistUid);
      return !isResigned;
    }
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
  if (sortBy === "oldest") return getNoteTime(a) - getNoteTime(b);
  if (sortBy === "patientName") {
    const byName = (a.patientName || "").localeCompare(b.patientName || "", "ko");
    if (byName !== 0) return byName;
  }
  return getNoteTime(b) - getNoteTime(a);
}

function getNoteTime(note: NoteData): number {
  const value = note.savedAt || note.noteDate || "";
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
