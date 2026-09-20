import type { NoteData, Therapist, TherapistRecord } from "@/types";
const SESSION = "pt_local_session";
const HOSPITAL = "pt_hospital_id";
export function hospitalId(): string {
  let id = localStorage.getItem(HOSPITAL);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(HOSPITAL, id); }
  return id;
}
export function currentActor(): Therapist {
  const raw = sessionStorage.getItem(SESSION);
  const session = raw ? JSON.parse(raw) as { uid?: string; credential?: string } : null;
  const records = JSON.parse(localStorage.getItem("pt_local_therapists") || "[]") as TherapistRecord[];
  const record = Array.isArray(records) ? records.find(t => t.uid === session?.uid) : undefined;
  // Derive roles from current account records, never the UI or caller-supplied role.
  if (!record || record.resigned || !record.passwordHash || session?.credential !== record.passwordHash) throw new Error("로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인해주세요.");
  return { uid: record.uid, id: record.id, name: record.name, role: record.role };
}
export function openSession(actor: Therapist): void {
  const records = JSON.parse(localStorage.getItem("pt_local_therapists") || "[]") as TherapistRecord[];
  sessionStorage.setItem(SESSION, JSON.stringify({ uid: actor.uid, credential: records.find(t => t.uid === actor.uid)?.passwordHash }));
  // Old cross-tab sessions are not trusted for authentication after upgrade.
  localStorage.removeItem(SESSION);
}
export function closeSession(): void { sessionStorage.removeItem(SESSION); localStorage.removeItem(SESSION); }
export function requireMaster(): Therapist {
  const actor = currentActor();
  if (actor.role !== "master") throw new Error("관리자 권한이 필요합니다.");
  return actor;
}
export function canAccessNote(note: NoteData, actor: Therapist): boolean {
  if (note.hospitalId && note.hospitalId !== hospitalId()) return false;
  return actor.role === "master" || note.therapistUid === actor.uid;
}
export function requireNoteAccess(note: NoteData, actor = currentActor()): void {
  if (!canAccessNote(note, actor)) throw new Error("이 기록에 접근할 권한이 없습니다. 담당자에게 확인해주세요.");
}
