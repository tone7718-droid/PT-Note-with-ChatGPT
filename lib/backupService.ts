import type { NoteData, TherapistRecord } from "@/types";

const AUTO_BACKUPS_KEY = "pt_auto_backups";

const MAX_FIELD_LENGTH = 20_000;

/** 스크립트 태그 및 이벤트 핸들러 속성 제거 후 길이 제한 */
function sanitizeString(val: unknown): string {
  if (typeof val !== "string") return "";
  return val
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .slice(0, MAX_FIELD_LENGTH);
}

function sanitizeNote(note: NoteData): NoteData {
  return {
    ...note,
    patientName: sanitizeString(note.patientName),
    chartNo: sanitizeString(note.chartNo),
    birthDate: sanitizeString(note.birthDate),
    gender: sanitizeString(note.gender),
    diagnosis: sanitizeString(note.diagnosis),
    pmh: sanitizeString(note.pmh),
    chiefComplaint: sanitizeString(note.chiefComplaint),
    postural: sanitizeString(note.postural),
    palpation: sanitizeString(note.palpation),
    specialTest: sanitizeString(note.specialTest),
    treatment: sanitizeString(note.treatment),
    homeExercise: sanitizeString(note.homeExercise),
    noteDate: sanitizeString(note.noteDate),
  };
}
const MAX_AUTO_BACKUPS = 10;

export interface BackupPayload {
  app: "PT-NOTE";
  version: 3;
  reason: "manual" | "auto";
  exportedAt: string;
  notes: NoteData[];
  therapists: TherapistRecord[];
}

export interface AutoBackupEntry {
  id: string;
  createdAt: string;
  reason: BackupPayload["reason"];
  notesCount: number;
  therapistsCount: number;
  payload: BackupPayload;
}

export function createBackupPayload({
  notes,
  therapists,
  reason,
  now = new Date(),
}: {
  notes: NoteData[];
  therapists: TherapistRecord[];
  reason: BackupPayload["reason"];
  now?: Date;
}): BackupPayload {
  return {
    app: "PT-NOTE",
    version: 3,
    reason,
    exportedAt: now.toISOString(),
    notes,
    therapists,
  };
}

export function validateBackupPayload(payload: unknown): {
  notesCount: number;
  therapistsCount: number;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }

  const candidate = payload as Partial<BackupPayload>;
  if (candidate.app !== "PT-NOTE" || candidate.version !== 3) {
    throw new Error("PT-NOTE 백업 파일이 아닙니다.");
  }

  if (!Array.isArray(candidate.notes) || !Array.isArray(candidate.therapists)) {
    throw new Error("백업 파일에 노트 또는 치료사 데이터가 없습니다.");
  }

  candidate.notes.forEach((note) => {
    if (!note || typeof note.id !== "string" || typeof note.savedAt !== "string") {
      throw new Error("백업 파일의 노트 데이터가 손상되었습니다.");
    }
  });

  candidate.therapists.forEach((therapist) => {
    if (!therapist || typeof therapist.uid !== "string" || typeof therapist.name !== "string") {
      throw new Error("백업 파일의 치료사 데이터가 손상되었습니다.");
    }
  });

  // 임포트 전 노트 문자열 필드 sanitize (in-place)
  candidate.notes = (candidate.notes as NoteData[]).map(sanitizeNote);

  return {
    notesCount: candidate.notes.length,
    therapistsCount: candidate.therapists.length,
  };
}

export function saveAutoBackup(payload: BackupPayload): AutoBackupEntry {
  validateBackupPayload(payload);
  const entry: AutoBackupEntry = {
    id: `backup-${payload.exportedAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: payload.exportedAt,
    reason: payload.reason,
    notesCount: payload.notes.length,
    therapistsCount: payload.therapists.length,
    payload,
  };

  const backups = [entry, ...readAutoBackups()].slice(0, MAX_AUTO_BACKUPS);
  writeAutoBackups(backups);
  return entry;
}

export function listAutoBackups(): AutoBackupEntry[] {
  return readAutoBackups();
}

export function parsePlainBackupText(text: string): BackupPayload {
  try {
    const parsed = JSON.parse(text) as BackupPayload;
    validateBackupPayload(parsed);
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.includes("백업")) throw err;
    throw new Error("백업 파일을 읽을 수 없습니다.");
  }
}

function readAutoBackups(): AutoBackupEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUTO_BACKUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is AutoBackupEntry => {
        return (
          !!entry &&
          typeof entry.id === "string" &&
          typeof entry.createdAt === "string" &&
          !!entry.payload
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

function writeAutoBackups(backups: AutoBackupEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTO_BACKUPS_KEY, JSON.stringify(backups));
}
