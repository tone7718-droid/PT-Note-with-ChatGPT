/**
 * localStorage 기반 데이터 서비스 (현재 운영 중인 단일 데이터 소스)
 *
 * 모든 노트·치료사 데이터는 브라우저/Tauri WebView 의 localStorage 에 저장.
 * 데스크톱 앱에서는 OS의 사용자 프로필 폴더에 영구 저장 (Tauri WebView2 storage).
 *
 * 데이터 키:
 *   - pt_local_notes        : NoteData[] (AES-GCM 암호화 저장)
 *   - pt_local_therapists   : TherapistRecord[]
 *   - pt_local_session      : { uid: string }  // 로그인 세션
 *   - pt_enc_key_v1         : 256-bit AES-GCM 키 (hex)
 *
 * 기본 마스터 계정: id "master" / pw "0000" (앱 첫 실행 시 자동 생성)
 *
 * 클라우드 모드 복귀 시: 새 lib/dataService.ts 작성 + useNoteStore 의 import 변경
 * (이전 클라우드 코드는 git history `14316af` 이전 커밋에서 참조 가능)
 */

import type { NoteData, TherapistRecord, Therapist } from "@/types";
import { hashPassword, verifyPassword, isLegacyHash } from "@/components/hashUtils";
import { encryptData, decryptData } from "@/lib/cryptoService";
import {
  createBackupPayload,
  saveAutoBackup,
  validateBackupPayload,
  type BackupPayload,
} from "@/lib/backupService";

/* ── Storage Keys ── */
const NOTES_KEY = "pt_local_notes";
const THERAPISTS_KEY = "pt_local_therapists";
const SESSION_KEY = "pt_local_session";

const DEFAULT_MASTER_PW = "0000";

/* ══════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════ */

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** 환자 노트를 AES-GCM 암호화해서 저장 */
async function writeNotes(notes: NoteData[]): Promise<void> {
  if (typeof window === "undefined") return;
  const encrypted = await encryptData(JSON.stringify(notes));
  window.localStorage.setItem(NOTES_KEY, encrypted);
}

/**
 * 환자 노트 복호화 읽기.
 * 기존 평문 데이터(마이그레이션 전)는 JSON 폴백으로 자동 처리.
 */
async function readNotes(): Promise<NoteData[]> {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(NOTES_KEY);
  if (!raw) return [];
  try {
    const decrypted = await decryptData(raw);
    return JSON.parse(decrypted) as NoteData[];
  } catch {
    // 암호화 전 평문 데이터 폴백 (최초 1회 마이그레이션)
    try {
      const plain = JSON.parse(raw) as NoteData[];
      if (Array.isArray(plain)) {
        await writeNotes(plain); // 즉시 암호화로 업그레이드
        return plain;
      }
    } catch {
      /* 손상된 데이터는 빈 배열 반환 */
    }
    return [];
  }
}

async function ensureBootstrapMaster(): Promise<void> {
  // 항상 실제 localStorage 를 확인. (모듈 캐시 사용 X — 외부에서
  // localStorage 가 비워지는 경우에도 안전하게 마스터 재생성)
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (therapists.length > 0) return;

  const masterPwHash = await hashPassword(DEFAULT_MASTER_PW);
  const master: TherapistRecord = {
    uid: "master-default",
    id: "master",
    name: "마스터",
    passwordHash: masterPwHash,
    role: "master",
    resigned: false,
  };
  write(THERAPISTS_KEY, [master]);
}

/* ══════════════════════════════════════════
   Auth
   ══════════════════════════════════════════ */

export async function signIn(
  loginId: string,
  password: string
): Promise<{ therapist: Therapist }> {
  await ensureBootstrapMaster();
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const found = therapists.find((t) => t.id === loginId);

  if (!found) throw new Error("ID 또는 비밀번호를 확인해주세요.");
  if (found.resigned) throw new Error("퇴사 처리된 계정입니다.");

  const valid = await verifyPassword(password, found.passwordHash);
  if (!valid) throw new Error("ID 또는 비밀번호를 확인해주세요.");

  // 레거시 SHA-256 해시를 PBKDF2 로 자동 업그레이드
  if (isLegacyHash(found.passwordHash)) {
    const newHash = await hashPassword(password);
    write(
      THERAPISTS_KEY,
      therapists.map((t) => (t.uid === found.uid ? { ...t, passwordHash: newHash } : t))
    );
  }

  const session: Therapist = {
    uid: found.uid,
    id: found.id,
    name: found.name,
    role: found.role,
  };
  write(SESSION_KEY, session);
  return { therapist: session };
}

export async function signOut(): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

type AuthSubscription = { unsubscribe: () => void };

export function onAuthStateChange(
  callback: (therapist: Therapist | null) => void
): { data: { subscription: AuthSubscription } } {
  // 페이지 로드 시 저장된 세션 복원
  void ensureBootstrapMaster().then(() => {
    const session = read<Therapist | null>(SESSION_KEY, null);
    callback(session);
  });

  return {
    data: {
      subscription: { unsubscribe: () => {} },
    },
  };
}

export async function reauthenticate(
  loginId: string,
  password: string
): Promise<boolean> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const found = therapists.find((t) => t.id === loginId);
  if (!found) return false;
  return verifyPassword(password, found.passwordHash);
}

/* ══════════════════════════════════════════
   Notes CRUD
   ══════════════════════════════════════════ */

/**
 * 구버전 painAreas (string[]) 자동 정리.
 * v0.1.3 이전에 저장된 노트는 painAreas 가 부위 ID 문자열 배열이었음.
 * v0.1.4 부터는 PainEntry[] (view+region+painLevel) 구조라 형식이 다름.
 * 호환 변환은 의학적으로 부정확해질 수 있어 그냥 비움 — 환자 본인이 다시 마킹.
 */
function sanitizePainAreas(note: NoteData): NoteData {
  const arr = note.painAreas as unknown;
  if (!Array.isArray(arr) || arr.length === 0) return note;
  // 첫 항목이 객체가 아니면 (= 구버전 문자열) 비움
  const first = arr[0];
  if (typeof first === "string" || (first !== null && typeof first === "object" && !("region" in first))) {
    return { ...note, painAreas: [] };
  }
  return note;
}

export async function fetchNotes(): Promise<NoteData[]> {
  return (await readNotes())
    .map(sanitizePainAreas)
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

export async function upsertNote(note: NoteData): Promise<NoteData> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  const enriched: NoteData = {
    ...note,
    therapist: note.therapist ?? session ?? undefined,
    therapistUid: note.therapistUid || session?.uid || "",
  };

  const notes = await readNotes();
  const idx = notes.findIndex((n) => n.id === enriched.id);
  if (idx >= 0) notes[idx] = enriched;
  else notes.unshift(enriched);
  await writeNotes(notes);
  return enriched;
}

export async function deleteNotes(ids: string[]): Promise<void> {
  await createCurrentAutoBackup();
  const notes = await readNotes();
  await writeNotes(notes.filter((n) => !ids.includes(n.id)));
}

export async function transferNotesRpc(
  fromUid: string,
  toUid: string,
  toName: string,
  toLoginId: string | null
): Promise<number> {
  const notes = await readNotes();
  let count = 0;
  const updated = notes.map((n) => {
    if (n.therapistUid === fromUid) {
      count++;
      return {
        ...n,
        therapistUid: toUid,
        therapist: {
          uid: toUid,
          id: toLoginId,
          name: toName,
          role: "therapist" as const,
        },
      };
    }
    return n;
  });
  await writeNotes(updated);
  return count;
}

/* ══════════════════════════════════════════
   Therapists CRUD
   ══════════════════════════════════════════ */

export async function fetchTherapists(): Promise<TherapistRecord[]> {
  await ensureBootstrapMaster();
  return read<TherapistRecord[]>(THERAPISTS_KEY, []);
}

export async function createTherapistViaEdgeFunction(
  loginId: string,
  name: string,
  password: string
): Promise<TherapistRecord> {
  if (!/^PT-\d{3}$/.test(loginId)) {
    throw new Error("ID 형식이 올바르지 않습니다 (PT-001 ~ PT-999).");
  }

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (therapists.some((t) => t.id === loginId && !t.resigned)) {
    throw new Error("이미 사용 중인 ID입니다.");
  }

  const passwordHash = await hashPassword(password);
  const newRecord: TherapistRecord = {
    uid: `therapist-${Date.now()}`,
    id: loginId,
    name,
    passwordHash,
    role: "therapist",
    resigned: false,
  };

  write(THERAPISTS_KEY, [...therapists, newRecord]);
  return newRecord;
}

export async function resignTherapistDb(uid: string): Promise<void> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === uid ? { ...t, id: null, resigned: true } : t))
  );
}

/**
 * 퇴사 처리된 치료사 레코드를 영구 삭제.
 * 이미 작성된 노트의 therapist 스냅샷은 그대로 유지되어 표시에 영향 없음.
 * 마스터 계정은 삭제 불가 (방어 로직).
 */
export async function deleteTherapistDb(uid: string): Promise<void> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const target = therapists.find((t) => t.uid === uid);
  if (!target) throw new Error("해당 치료사를 찾을 수 없습니다.");
  if (target.role === "master") throw new Error("마스터 계정은 삭제할 수 없습니다.");
  if (!target.resigned) throw new Error("퇴사 처리된 치료사만 삭제할 수 있습니다.");
  write(THERAPISTS_KEY, therapists.filter((t) => t.uid !== uid));
}

export async function updateTherapistPasswordViaAuth(
  newPassword: string
): Promise<void> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  if (!session) throw new Error("로그인 세션이 없습니다.");

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const passwordHash = await hashPassword(newPassword);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === session.uid ? { ...t, passwordHash } : t))
  );
}

/* ══════════════════════════════════════════
   Export / Import
   ══════════════════════════════════════════ */

/** 내보내기: 노트를 복호화한 평문 JSON 반환 */
export async function exportAllData(): Promise<string> {
  return JSON.stringify(await buildBackupPayload("manual"), null, 2);
}

export async function importNotes(notes: NoteData[]): Promise<number> {
  if (notes.length === 0) return 0;
  await createCurrentAutoBackup();
  const existing = await readNotes();
  const existingIds = new Set(existing.map((n) => n.id));
  const newOnes = notes.filter((n) => !existingIds.has(n.id));
  if (newOnes.length === 0) return 0;
  await writeNotes([...newOnes, ...existing]);
  return newOnes.length;
}

export async function buildBackupPayload(
  reason: BackupPayload["reason"] = "manual"
): Promise<BackupPayload> {
  return createBackupPayload({
    notes: await readNotes(), // 복호화된 평문 노트
    therapists: read<TherapistRecord[]>(THERAPISTS_KEY, []),
    reason,
  });
}

export async function createCurrentAutoBackup(): Promise<void> {
  const payload = await buildBackupPayload("auto");
  if (payload.notes.length === 0 && payload.therapists.length === 0) return;
  saveAutoBackup(payload);
}

export async function importBackupPayload(payload: BackupPayload): Promise<{
  notesCount: number;
  therapistsCount: number;
}> {
  validateBackupPayload(payload);
  await createCurrentAutoBackup();

  const existingNotes = await readNotes();
  const existingTherapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const noteIds = new Set(existingNotes.map((n) => n.id));
  const therapistUids = new Set(existingTherapists.map((t) => t.uid));

  const importedNotes = payload.notes.filter((n) => !noteIds.has(n.id));
  const importedTherapists = payload.therapists.filter((t) => !therapistUids.has(t.uid));

  if (importedNotes.length > 0) {
    await writeNotes([...importedNotes, ...existingNotes]);
  }
  if (importedTherapists.length > 0) {
    write(THERAPISTS_KEY, [...existingTherapists, ...importedTherapists]);
  }

  return {
    notesCount: importedNotes.length,
    therapistsCount: importedTherapists.length,
  };
}
