import type { NoteData, TherapistRecord } from "@/types";
import { encryptData, decryptData } from "@/lib/cryptoService";

const AUTO_BACKUPS_KEY = "pt_auto_backups";

const MAX_FIELD_LENGTH = 20_000;

/**
 * 스크립트 태그 및 인라인 이벤트 핸들러 속성 제거 후 길이 제한.
 * 핸들러 패턴은 따옴표가 뒤따르는 HTML 속성 형태(onclick=")로만 좁게 매칭 —
 * "onset = 3일 전", "pronation = 80°" 같은 임상 기록 텍스트를 건드리지 않도록.
 */
function sanitizeString(val: unknown): string {
  if (typeof val !== "string") return "";
  return val
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*["']/gi, "")
    .slice(0, MAX_FIELD_LENGTH);
}

export function sanitizeNote(note: NoteData): NoteData {
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
// 자동 백업은 전체 데이터의 사본이므로 localStorage 쿼터(5~10MB)를 크게 차지함.
// 개수를 보수적으로 유지 (5개 = 최근 5회의 삭제/가져오기 시점 복구 가능)
const MAX_AUTO_BACKUPS = 5;

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
  /** AES-GCM 암호화된 BackupPayload JSON (현재 포맷) */
  payloadEnc?: string;
  /** 평문 payload (암호화 도입 전 레거시 엔트리 — 읽기만 지원) */
  payload?: BackupPayload;
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

export async function saveAutoBackup(payload: BackupPayload): Promise<AutoBackupEntry> {
  validateBackupPayload(payload);
  const entry: AutoBackupEntry = {
    id: `backup-${payload.exportedAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: payload.exportedAt,
    reason: payload.reason,
    notesCount: payload.notes.length,
    therapistsCount: payload.therapists.length,
    // 노트 본문(pt_local_notes)과 동일하게 암호화 저장 — 평문 사본을 남기지 않음
    payloadEnc: await encryptData(JSON.stringify(payload)),
  };

  const backups = [entry, ...readAutoBackups()].slice(0, MAX_AUTO_BACKUPS);
  writeAutoBackups(backups);
  return entry;
}

export function listAutoBackups(): AutoBackupEntry[] {
  return readAutoBackups();
}

/** 자동 백업 엔트리의 payload 복원 (암호화/레거시 평문 모두 지원) */
export async function readAutoBackupPayload(entry: AutoBackupEntry): Promise<BackupPayload> {
  if (entry.payloadEnc) {
    const parsed = JSON.parse(await decryptData(entry.payloadEnc)) as BackupPayload;
    validateBackupPayload(parsed);
    return parsed;
  }
  if (entry.payload) return entry.payload;
  throw new Error("자동 백업 데이터가 손상되었습니다.");
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
          (!!entry.payloadEnc || !!entry.payload)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

function writeAutoBackups(backups: AutoBackupEntry[]) {
  if (typeof window === "undefined") return;
  // localStorage 쿼터 초과 시 오래된 백업부터 줄여가며 재시도.
  // 백업 저장 실패가 삭제/가져오기 같은 본 작업을 막지 않도록 최종적으로는 포기.
  let toWrite = backups;
  while (toWrite.length > 0) {
    try {
      window.localStorage.setItem(AUTO_BACKUPS_KEY, JSON.stringify(toWrite));
      return;
    } catch {
      toWrite = toWrite.slice(0, toWrite.length - 1);
    }
  }
  console.warn("[backupService] 저장 공간 부족으로 자동 백업을 저장하지 못했습니다.");
}
