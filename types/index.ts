export interface TherapistRecord {
  uid: string;
  id: string | null;
  name: string;
  passwordHash: string; // PBKDF2 해시 (lib/hashUtils) — 내보내기 파일에는 포함되지 않음
  role: "therapist" | "master";
  resigned: boolean;
}

export interface Therapist {
  uid: string;
  id: string | null;
  name: string;
  role: "therapist" | "master";
}

export type PainView = "anterior" | "posterior";
export type PainLevel = 1 | 2 | 3;

export interface PainEntry {
  view: PainView;
  region: string; // 한글 부위명 (예: "우측 대흉근")
  painLevel: PainLevel;
}

export interface NoteData {
  id: string;
  savedAt: string;
  patientName: string;
  chartNo: string;
  birthDate: string;
  gender: string;
  diagnosis: string;
  pmh: string;
  painScore: number | null;
  painAreas: PainEntry[];
  chiefComplaint: string;
  rom: { joint: string; measuredROM: string; normalRange: string }[];
  postural: string;
  palpation: string;
  specialTest: string;
  treatment: string;
  homeExercise: string;
  noteDate: string;
  therapist?: Therapist | null;
  therapistUid?: string;
}

export const EMPTY_NOTE: Omit<NoteData, "id" | "savedAt"> = {
  patientName: "", chartNo: "", birthDate: "", gender: "", diagnosis: "", pmh: "",
  painScore: null, painAreas: [], chiefComplaint: "", rom: [],
  postural: "", palpation: "", specialTest: "", treatment: "", homeExercise: "",
  noteDate: "", therapist: null, therapistUid: "",
};
