// CG<-AG localDataService — ported from pt-note-with-antigravity
import { seedLegacyAdmin } from "./testAuth";
import { describe, it, expect, beforeEach } from "vitest";
import * as ds from "@/lib/localDataService";
import { invalidateEncKeyCache } from "@/lib/cryptoService";
import type { NoteData } from "@/types";

const sampleNote = (overrides: Partial<NoteData> = {}): NoteData => ({
  id: `note-${Math.random().toString(36).slice(2, 9)}`,
  savedAt: new Date().toISOString(),
  patientName: "홍길동",
  chartNo: "0001",
  birthDate: "1990-01-01",
  gender: "M",
  diagnosis: "",
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
  noteDate: "2026-07-10",
  therapist: null,
  therapistUid: "",
  ...overrides,
});

beforeEach(async () => {
  await seedLegacyAdmin();
  invalidateEncKeyCache();
});

describe("localDataService — 암호화 저장", () => {
  it("saves notes encrypted (환자명이 localStorage 에 평문으로 남지 않음)", async () => {
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "김환자" }));
    const raw = window.localStorage.getItem("pt_local_notes")!;
    expect(raw).not.toContain("김환자");

    const all = await ds.fetchNotes();
    expect(all).toHaveLength(1);
    expect(all[0].patientName).toBe("김환자");
  });

  it("migrates legacy plaintext notes to encrypted storage on read", async () => {
    const legacy = [sampleNote({ id: "legacy-1", patientName: "평문환자" })];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy));

    const notes = await ds.fetchNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].patientName).toBe("평문환자");
    expect(window.localStorage.getItem("pt_local_notes")!).not.toContain("평문환자");
  });
});

describe("localDataService — patientId", () => {

  it("groups notes by chart number", async () => {
    const a = await ds.upsertNote(sampleNote({ id: "a", chartNo: "C-1" }));
    const b = await ds.upsertNote(sampleNote({ id: "b", chartNo: "C-1" }));
    expect(b.patientId).toBe(a.patientId);
  });
});
