import { withDataLock, commitData } from "@/lib/storageLock";
import { parseExchangeBackup, reconcilePatients, mergeTherapists, type ImportResult } from "@/lib/backupExchange";
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
import { hashPassword, verifyPassword, isLegacyHash } from "@/lib/hashUtils";
import {
  encryptData,
  decryptData,
  encryptWithPassphrase,
  decryptWithPassphrase,
  type PassphraseEncrypted,
} from "@/lib/cryptoService";
import {
  createBackupPayload,
  saveAutoBackup,
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
    throw new Error("계정 또는 세션 저장소를 읽을 수 없습니다. 원본을 보존했습니다.");
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
  let parsed: unknown;
  try { parsed = raw.trimStart().startsWith("[") ? JSON.parse(raw) : JSON.parse(await decryptData(raw)); }
  catch { throw new Error("기록을 읽을 수 없습니다. 원본을 보존하기 위해 저장을 중단했습니다. 암호화 키와 백업을 확인해주세요."); }
  if (!Array.isArray(parsed)) throw new Error("기록 저장소가 손상되었습니다. 원본을 보존하고 저장을 중단했습니다.");
  const checked = parseExchangeBackup({ notes: parsed.map(sanitizePainAreas) });
  if (checked.skippedCount || checked.duplicateCount) throw new Error("기록 저장소에 잘못된 항목 또는 중복 ID가 있습니다. 원본을 보존하고 복구가 필요합니다.");
  return checked.notes;
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

async function signInUnlocked(
  loginId: string,
  password: string
): Promise<{ therapist: Therapist; usingDefaultPassword: boolean }> {
  await ensureBootstrapMaster();
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const normalizedId = loginId.trim().toLowerCase();
  const found = therapists.find((t) => t.id?.toLowerCase() === normalizedId);

  if (!found) throw new Error("ID 또는 비밀번호를 확인해주세요.");
  if (found.resigned) throw new Error("퇴사 처리된 계정입니다.");
  if (!found.passwordHash) {
    throw new Error("비밀번호가 설정되지 않은 계정입니다. 마스터에게 비밀번호 재설정을 요청하세요.");
  }

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
  // 기본 비밀번호("0000") 사용 여부 — UI 에서 변경 안내 배너 표시용
  return { therapist: session, usingDefaultPassword: password === DEFAULT_MASTER_PW };
}

async function signOutUnlocked(): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

type AuthSubscription = { unsubscribe: () => void };

export function onAuthStateChange(
  callback: (therapist: Therapist | null) => void
): { data: { subscription: AuthSubscription } } {
  // 페이지 로드 시 저장된 세션 복원
  void withDataLock(ensureBootstrapMaster).then(() => {
    const session = read<Therapist | null>(SESSION_KEY, null);
    callback(session);
  }).catch(() => callback(null));

  return {
    data: {
      subscription: { unsubscribe: () => {} },
    },
  };
}

async function reauthenticateUnlocked(
  loginId: string,
  password: string
): Promise<boolean> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const normalizedId = loginId.trim().toLowerCase();
  const found = therapists.find((t) => t.id?.toLowerCase() === normalizedId);
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

/* ══════════════════════════════════════════
   환자 식별자 (patientId) — PT-Progress-Note 에서 이식
   ══════════════════════════════════════════
   동명이인 구분을 위해 노트마다 내부 환자 ID를 부여한다.
   매칭 규칙: 차트번호 → 이름+생년월일 → (백필 한정, 완전 무식별 레코드만) 이름 단독 */

/** pool 에서 동일 환자로 볼 수 있는 patientId 를 찾는다. 없으면 null. */
function findMatchingPatientId(note: NoteData, pool: NoteData[]): string | null {
  const chartNo = note.chartNo?.trim();
  if (chartNo) {
    const match = pool.find((n) => n.patientId && n.chartNo?.trim() === chartNo);
    if (match?.patientId) return match.patientId;
  }

  const name = note.patientName?.trim();
  const birth = note.birthDate?.trim();
  if (name && birth) {
    const match = pool.find(
      (n) => n.patientId && n.patientName?.trim() === name && n.birthDate?.trim() === birth
    );
    if (match?.patientId) return match.patientId;
  }

  return null;
}

function resolvePatientId(
  note: NoteData,
  pool: NoteData[],
  options: { allowNameOnly?: boolean } = {}
): string {
  if (note.patientId) return note.patientId;

  const matched = findMatchingPatientId(note, pool);
  if (matched) return matched;

  // 동명이인 오병합 방지: 양쪽 모두 차트번호·생년월일이 전혀 없는
  // 완전히 구분 불가능한 레코드끼리만 이름 단독으로 묶는다
  const name = note.patientName?.trim();
  const birth = note.birthDate?.trim();
  const chartNo = note.chartNo?.trim();
  if (options.allowNameOnly && name && !birth && !chartNo) {
    const match = pool.find(
      (n) =>
        n.patientId &&
        n.patientName?.trim() === name &&
        !n.birthDate?.trim() &&
        !n.chartNo?.trim()
    );
    if (match?.patientId) return match.patientId;
  }

  return `patient-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** patientId 가 없는 기존 노트에 백필. 모든 노트에 있으면 no-op (idempotent). */
async function ensurePatientIds(notes: NoteData[]): Promise<NoteData[]> {
  if (notes.length === 0 || notes.every((n) => n.patientId)) return notes;

  const ordered = [...notes].sort(
    (a, b) => new Date(a.savedAt || 0).getTime() - new Date(b.savedAt || 0).getTime()
  );
  for (const note of ordered) {
    if (!note.patientId) {
      note.patientId = resolvePatientId(note, ordered, { allowNameOnly: true });
    }
  }
  await writeNotes(notes);
  return notes;
}

async function fetchNotesUnlocked(): Promise<NoteData[]> {
  const notes = await ensurePatientIds(await readNotes());
  return notes
    .map(sanitizePainAreas)
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

async function upsertNoteUnlocked(note: NoteData, expectedSavedAt?: string): Promise<NoteData> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  const notes = await ensurePatientIds(await readNotes());
  if (expectedSavedAt !== undefined && notes.find(n => n.id === note.id)?.savedAt !== expectedSavedAt) {
    throw new Error("다른 창에서 이 기록이 변경되거나 삭제되었습니다. 현재 입력 내용을 복사해 보관한 뒤 기록을 다시 열어주세요.");
  }
  const enriched: NoteData = {
    ...note,
    // 같은 id 의 기존 노트가 있으면 그 patientId 를 재사용 (재저장 churn 방지)
    patientId:
      note.patientId ||
      notes.find((n) => n.id === note.id)?.patientId ||
      resolvePatientId(note, notes),
    therapist: note.therapist ?? session ?? undefined,
    therapistUid: note.therapistUid || session?.uid || "",
  };

  // 기존 노트 덮어쓰기 전 자동 백업 — 의무기록 수정 이력 보존 (실수로 덮어쓴 내용 복원 가능)
  if (notes.some((n) => n.id === enriched.id)) {
    await createCurrentAutoBackupUnlocked();
  }

  const idx = notes.findIndex((n) => n.id === enriched.id);
  if (idx >= 0) notes[idx] = enriched;
  else notes.unshift(enriched);
  await writeNotes(notes);
  return enriched;
}

async function deleteNotesUnlocked(ids: string[]): Promise<void> {
  await createCurrentAutoBackupUnlocked();
  const notes = await readNotes();
  await writeNotes(notes.filter((n) => !ids.includes(n.id)));
}

async function transferNotesRpcUnlocked(
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
        savedAt: new Date(Math.max(Date.now(), (Date.parse(n.savedAt ?? "") || 0) + 1)).toISOString(),
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
  if (count) {
    await createCurrentAutoBackupUnlocked();
    await writeNotes(updated);
  }
  return count;
}

/* ══════════════════════════════════════════
   Therapists CRUD
   ══════════════════════════════════════════ */

async function fetchTherapistsUnlocked(): Promise<TherapistRecord[]> {
  await ensureBootstrapMaster();
  return read<TherapistRecord[]>(THERAPISTS_KEY, []);
}

/** 새 치료사 등록 (로컬 모드 — Supabase Edge Function 미사용) */
async function createTherapistUnlocked(
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
    uid: `therapist-${crypto.randomUUID()}`,
    id: loginId,
    name,
    passwordHash,
    role: "therapist",
    resigned: false,
  };

  write(THERAPISTS_KEY, [...therapists, newRecord]);
  return newRecord;
}

async function resignTherapistDbUnlocked(uid: string): Promise<void> {
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
async function deleteTherapistDbUnlocked(uid: string): Promise<void> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const target = therapists.find((t) => t.uid === uid);
  if (!target) throw new Error("해당 치료사를 찾을 수 없습니다.");
  if (target.role === "master") throw new Error("마스터 계정은 삭제할 수 없습니다.");
  if (!target.resigned) throw new Error("퇴사 처리된 치료사만 삭제할 수 있습니다.");
  write(THERAPISTS_KEY, therapists.filter((t) => t.uid !== uid));
}

/** 현재 로그인된 치료사 본인의 비밀번호 변경 */
async function updateTherapistPasswordUnlocked(
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

/**
 * master 가 다른 치료사의 비밀번호를 재설정.
 * 백업에서 복원된 "비밀번호 미설정(로그인 잠금)" 계정을 활성화하는 유일한 경로.
 */
async function resetTherapistPasswordDbUnlocked(
  uid: string,
  newPassword: string
): Promise<void> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  if (!session || session.role !== "master") {
    throw new Error("마스터 계정만 비밀번호를 재설정할 수 있습니다.");
  }

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const target = therapists.find((t) => t.uid === uid);
  if (!target) throw new Error("해당 치료사를 찾을 수 없습니다.");
  if (target.resigned) throw new Error("퇴사 처리된 계정은 재설정할 수 없습니다.");

  const passwordHash = await hashPassword(newPassword);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === uid ? { ...t, passwordHash } : t))
  );
}

/* ══════════════════════════════════════════
   Export / Import
   ══════════════════════════════════════════ */

/**
 * 내보내기: 노트를 복호화한 평문 JSON 반환.
 * 보안: 비밀번호 해시는 파일에 포함하지 않는다 (백업 파일은 공유·유출되기 쉬움).
 * 해시 없는 치료사 계정은 로그인 잠금 상태로 가져오며 관리자가 비밀번호를 재설정해야 함.
 */
async function exportAllDataUnlocked(): Promise<string> {
  const payload = await buildBackupPayloadUnlocked("manual");
  const sanitized: BackupPayload = {
    ...payload,
    therapists: payload.therapists.map((t) => ({ ...t, passwordHash: "" })),
  };
  return JSON.stringify(sanitized, null, 2);
}

/* ── passphrase 암호화 백업 ── */

const ENCRYPTED_BACKUP_FORMAT = "ptnote-encrypted-v1";

interface EncryptedBackupEnvelope extends PassphraseEncrypted {
  app: string;
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  exportedAt: string;
}

/**
 * 내보내기(암호화): 백업 페이로드 전체를 passphrase 파생 키로 AES-GCM 암호화.
 * 파일 자체가 잠기므로 비밀번호 해시를 **유지**한다 — 새 기기에서 복원하면
 * 해시가 포함된 계정은 기존 비밀번호로 로그인 가능.
 */
async function exportAllDataEncryptedUnlocked(passphrase: string): Promise<string> {
  const payload = await buildBackupPayloadUnlocked("manual"); // 해시 포함
  const encrypted = await encryptWithPassphrase(JSON.stringify(payload), passphrase);
  const envelope: EncryptedBackupEnvelope = {
    app: "PT-NOTE",
    format: ENCRYPTED_BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    ...encrypted,
  };
  return JSON.stringify(envelope, null, 2);
}

/** 파일 내용이 암호화 백업(passphrase 필요)인지 판별 */
export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return !!parsed && parsed.format === ENCRYPTED_BACKUP_FORMAT;
  } catch {
    return false;
  }
}

/** 암호화 백업을 평문 백업 JSON 문자열로 복호화. passphrase 불일치 시 throw. */
export async function decryptBackupText(text: string, passphrase: string): Promise<string> {
  const envelope = JSON.parse(text) as EncryptedBackupEnvelope;
  if (envelope.format !== ENCRYPTED_BACKUP_FORMAT) {
    throw new Error("암호화 백업 형식이 아닙니다.");
  }
  try {
    return await decryptWithPassphrase(envelope, passphrase);
  } catch {
    throw new Error("백업 암호가 올바르지 않습니다.");
  }
}

async function importNotesUnlocked(notes: NoteData[]): Promise<number> {
  const parsed = parseExchangeBackup({ notes });
  const existing = await readNotes();
  const ids = new Set(existing.map(n => n.id));
  const newOnes = parsed.notes.filter(n => !ids.has(n.id));
  reconcilePatients(newOnes, existing);
  if (newOnes.length) { await createCurrentAutoBackupUnlocked(); await writeNotes([...newOnes, ...existing]); }
  return newOnes.length;
}
async function buildBackupPayloadUnlocked(
  reason: BackupPayload["reason"] = "manual"
): Promise<BackupPayload> {
  return createBackupPayload({
    notes: await readNotes(), // 복호화된 평문 노트
    therapists: read<TherapistRecord[]>(THERAPISTS_KEY, []),
    reason,
  });
}

async function createCurrentAutoBackupUnlocked(): Promise<void> {
  await saveAutoBackup(await buildBackupPayloadUnlocked("auto"));
}
async function importBackupPayloadUnlocked(payload: BackupPayload): Promise<ImportResult> {
  return importCompatibleBackupUnlocked(JSON.stringify(payload));
}
/** A single atomic, validated import path for plain, encrypted and legacy backups. */
async function importCompatibleBackupUnlocked(json: string, passphrase?: string): Promise<ImportResult> {
  const plain = isEncryptedBackup(json) ? await decryptBackupText(json, passphrase ?? "") : json;
  const parsed = parseExchangeBackup(JSON.parse(plain));
  const existing = await readNotes();
  await ensureBootstrapMaster();
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const ids = new Set(existing.map(n => n.id));
  const incoming = parsed.notes.filter(n => !ids.has(n.id));
  reconcilePatients(incoming, existing);
  const accounts = mergeTherapists(parsed.therapists, therapists);
  if (incoming.length || accounts.added.length) {
    await createCurrentAutoBackupUnlocked();
    const values: Record<string, string> = {};
    if (incoming.length) values[NOTES_KEY] = await encryptData(JSON.stringify([...incoming, ...existing]));
    if (accounts.added.length) values[THERAPISTS_KEY] = JSON.stringify([...therapists, ...accounts.added]);
    commitData(values);
  }
  return { notesCount: incoming.length, therapistsCount: accounts.added.length, skippedCount: parsed.skippedCount,
    duplicateCount: parsed.duplicateCount + parsed.notes.length - incoming.length + accounts.duplicates };
}

/** Restore note contents, not a deduplicating merge. Keep current login accounts. */
async function restoreNoteSnapshotUnlocked(notes: NoteData[]): Promise<number> {
  const parsed = parseExchangeBackup({ notes });
  if (parsed.skippedCount || parsed.duplicateCount) throw new Error("백업 기록이 손상되어 복원을 중단했습니다.");
  await createCurrentAutoBackupUnlocked();
  await writeNotes(parsed.notes);
  return parsed.notes.length;
}

// Hold the origin-wide lock throughout every complete data operation.
export const signIn = (...args: Parameters<typeof signInUnlocked>): ReturnType<typeof signInUnlocked> => withDataLock(() => signInUnlocked(...args));
export const signOut = (...args: Parameters<typeof signOutUnlocked>): ReturnType<typeof signOutUnlocked> => withDataLock(() => signOutUnlocked(...args));
export const reauthenticate = (...args: Parameters<typeof reauthenticateUnlocked>): ReturnType<typeof reauthenticateUnlocked> => withDataLock(() => reauthenticateUnlocked(...args));
export const fetchNotes = (...args: Parameters<typeof fetchNotesUnlocked>): ReturnType<typeof fetchNotesUnlocked> => withDataLock(() => fetchNotesUnlocked(...args));
export const upsertNote = (...args: Parameters<typeof upsertNoteUnlocked>): ReturnType<typeof upsertNoteUnlocked> => withDataLock(() => upsertNoteUnlocked(...args));
export const deleteNotes = (...args: Parameters<typeof deleteNotesUnlocked>): ReturnType<typeof deleteNotesUnlocked> => withDataLock(() => deleteNotesUnlocked(...args));
export const transferNotesRpc = (...args: Parameters<typeof transferNotesRpcUnlocked>): ReturnType<typeof transferNotesRpcUnlocked> => withDataLock(() => transferNotesRpcUnlocked(...args));
export const fetchTherapists = (...args: Parameters<typeof fetchTherapistsUnlocked>): ReturnType<typeof fetchTherapistsUnlocked> => withDataLock(() => fetchTherapistsUnlocked(...args));
export const createTherapist = (...args: Parameters<typeof createTherapistUnlocked>): ReturnType<typeof createTherapistUnlocked> => withDataLock(() => createTherapistUnlocked(...args));
export const resignTherapistDb = (...args: Parameters<typeof resignTherapistDbUnlocked>): ReturnType<typeof resignTherapistDbUnlocked> => withDataLock(() => resignTherapistDbUnlocked(...args));
export const deleteTherapistDb = (...args: Parameters<typeof deleteTherapistDbUnlocked>): ReturnType<typeof deleteTherapistDbUnlocked> => withDataLock(() => deleteTherapistDbUnlocked(...args));
export const updateTherapistPassword = (...args: Parameters<typeof updateTherapistPasswordUnlocked>): ReturnType<typeof updateTherapistPasswordUnlocked> => withDataLock(() => updateTherapistPasswordUnlocked(...args));
export const resetTherapistPasswordDb = (...args: Parameters<typeof resetTherapistPasswordDbUnlocked>): ReturnType<typeof resetTherapistPasswordDbUnlocked> => withDataLock(() => resetTherapistPasswordDbUnlocked(...args));
export const exportAllData = (...args: Parameters<typeof exportAllDataUnlocked>): ReturnType<typeof exportAllDataUnlocked> => withDataLock(() => exportAllDataUnlocked(...args));
export const exportAllDataEncrypted = (...args: Parameters<typeof exportAllDataEncryptedUnlocked>): ReturnType<typeof exportAllDataEncryptedUnlocked> => withDataLock(() => exportAllDataEncryptedUnlocked(...args));
export const importNotes = (...args: Parameters<typeof importNotesUnlocked>): ReturnType<typeof importNotesUnlocked> => withDataLock(() => importNotesUnlocked(...args));
export const buildBackupPayload = (...args: Parameters<typeof buildBackupPayloadUnlocked>): ReturnType<typeof buildBackupPayloadUnlocked> => withDataLock(() => buildBackupPayloadUnlocked(...args));
export const createCurrentAutoBackup = (...args: Parameters<typeof createCurrentAutoBackupUnlocked>): ReturnType<typeof createCurrentAutoBackupUnlocked> => withDataLock(() => createCurrentAutoBackupUnlocked(...args));
export const importBackupPayload = (...args: Parameters<typeof importBackupPayloadUnlocked>): ReturnType<typeof importBackupPayloadUnlocked> => withDataLock(() => importBackupPayloadUnlocked(...args));
export const importCompatibleBackup = (...args: Parameters<typeof importCompatibleBackupUnlocked>): ReturnType<typeof importCompatibleBackupUnlocked> => withDataLock(() => importCompatibleBackupUnlocked(...args));
export const restoreNoteSnapshot = (...args: Parameters<typeof restoreNoteSnapshotUnlocked>): ReturnType<typeof restoreNoteSnapshotUnlocked> => withDataLock(() => restoreNoteSnapshotUnlocked(...args));
