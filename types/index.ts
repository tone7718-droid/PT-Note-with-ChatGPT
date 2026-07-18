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
  patientId?: string; // 내부 환자 식별자 (동명이인 구분용, 저장 시 자동 부여)
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
  /** 치료 직후 통증 점수 (NRS 0~10) — painScore(치료 전)와 비교용. 구버전 노트에는 없음 */
  painScoreAfter?: number | null;
  /** 평가 소견 (Assessment) — 치료 반응·호전도·임상적 판단. 구버전 노트에는 없음 */
  assessment?: string;
  homeExercise: string;
  /** 계획 (Plan) — 다음 회차 치료 방향. 구버전 노트에는 없음 */
  plan?: string;
  noteDate: string;
  therapist?: Therapist | null;
  therapistUid?: string;
}

export const EMPTY_NOTE: Omit<NoteData, "id" | "savedAt"> = {
  patientId: "", patientName: "", chartNo: "", birthDate: "", gender: "", diagnosis: "", pmh: "",
  painScore: null, painAreas: [], chiefComplaint: "", rom: [],
  postural: "", palpation: "", specialTest: "", treatment: "", painScoreAfter: null,
  assessment: "", homeExercise: "", plan: "",
  noteDate: "", therapist: null, therapistUid: "",
};
