import { describe, expect, it } from "vitest";
import {
  filterAndSortSidebarNotes,
  getVisibleSidebarNotes,
  hasActiveSidebarFilters,
  type SidebarFilters,
} from "@/lib/sidebarFilters";
import type { NoteData, Therapist, TherapistRecord } from "@/types";

const note = (partial: Partial<NoteData>): NoteData => ({
  id: partial.id ?? "note-1",
  savedAt: partial.savedAt ?? "2026-05-08T09:00:00.000Z",
  patientName: partial.patientName ?? "김철수",
  chartNo: partial.chartNo ?? "PT-001",
  birthDate: "",
  gender: "",
  diagnosis: partial.diagnosis ?? "요통",
  pmh: "",
  painScore: null,
  painAreas: [],
  chiefComplaint: "",
  rom: [],
  postural: "",
  palpation: "",
  specialTest: "",
  treatment: "",
  homeExercise: "",
  noteDate: partial.noteDate ?? "2026-05-08",
  therapist: null,
  therapistUid: partial.therapistUid ?? "t1",
});

const therapist = (partial: Partial<Therapist>): Therapist => ({
  uid: partial.uid ?? "t1",
  id: partial.id ?? "PT-001",
  name: partial.name ?? "김치료",
  role: partial.role ?? "therapist",
});

const therapistRecord = (partial: Partial<TherapistRecord>): TherapistRecord => ({
  uid: partial.uid ?? "t1",
  id: partial.id ?? "PT-001",
  name: partial.name ?? "김치료",
  passwordHash: "hash",
  role: partial.role ?? "therapist",
  resigned: partial.resigned ?? false,
});

describe("sidebar filters", () => {
  it("filters notes by search, therapist, and inclusive date range", () => {
    const filters: SidebarFilters = {
      search: "목",
      therapistUid: "t2",
      startDate: "2026-05-01",
      endDate: "2026-05-08",
      sortBy: "newest",
    };

    const result = filterAndSortSidebarNotes(
      [
        note({ id: "match", patientName: "이영희", diagnosis: "목 통증", therapistUid: "t2", noteDate: "2026-05-08" }),
        note({ id: "wrong-search", patientName: "박민수", diagnosis: "요통", therapistUid: "t2", noteDate: "2026-05-08" }),
        note({ id: "wrong-therapist", patientName: "최민정", diagnosis: "목 통증", therapistUid: "t1", noteDate: "2026-05-08" }),
        note({ id: "wrong-date", patientName: "정지훈", diagnosis: "목 통증", therapistUid: "t2", noteDate: "2026-05-09" }),
      ],
      filters
    );

    expect(result.map((n) => n.id)).toEqual(["match"]);
  });

  it("sorts by newest, oldest, and patient name", () => {
    const notes = [
      note({ id: "b", patientName: "홍길동", savedAt: "2026-05-07T09:00:00.000Z" }),
      note({ id: "a", patientName: "강하늘", savedAt: "2026-05-08T09:00:00.000Z" }),
    ];

    expect(filterAndSortSidebarNotes(notes, { sortBy: "newest" }).map((n) => n.id)).toEqual(["a", "b"]);
    expect(filterAndSortSidebarNotes(notes, { sortBy: "oldest" }).map((n) => n.id)).toEqual(["b", "a"]);
    expect(filterAndSortSidebarNotes(notes, { sortBy: "patientName" }).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("keeps master resigned notes hidden from the main list", () => {
    const result = getVisibleSidebarNotes({
      notes: [note({ id: "active", therapistUid: "t1" }), note({ id: "resigned", therapistUid: "t2" })],
      therapists: [therapistRecord({ uid: "t1" }), therapistRecord({ uid: "t2", resigned: true })],
      therapist: therapist({ role: "master" }),
    });

    expect(result.map((n) => n.id)).toEqual(["active"]);
  });

  it("detects whether any optional filters are active", () => {
    expect(hasActiveSidebarFilters({ sortBy: "newest" })).toBe(false);
    expect(hasActiveSidebarFilters({ sortBy: "newest", endDate: "2026-05-08" })).toBe(true);
    expect(hasActiveSidebarFilters({ sortBy: "patientName" })).toBe(true);
  });
});
