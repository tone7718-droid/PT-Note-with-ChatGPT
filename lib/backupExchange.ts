import { normalizeRom } from "@/lib/romMeasurement";
import { EMPTY_NOTE, type NoteData, type TherapistRecord } from "@/types";
import { ANT_CENTER, ANT_PAIRED, POST_CENTER, POST_PAIRED } from "@/components/bodyDiagramShapes";
export interface ImportResult { notesCount: number; therapistsCount: number; skippedCount: number; duplicateCount: number; }
export interface ExchangeBackup {
  app: "PT-NOTE"; version: 3; exportedAt: string; reason: "manual" | "auto";
  notes: NoteData[]; therapists: TherapistRecord[];
}
const fields = ["patientName", "chartNo", "birthDate", "gender", "diagnosis", "pmh", "chiefComplaint", "postural", "palpation", "specialTest", "treatment", "assessment", "homeExercise", "plan", "noteDate"] as const;
const views = new Map<string, "anterior" | "posterior">();
for (const [center, paired, view] of [[ANT_CENTER, ANT_PAIRED, "anterior"], [POST_CENTER, POST_PAIRED, "posterior"]] as const) {
  for (const s of center) if (!views.has(s.name)) views.set(s.name, view);
  for (const s of paired) for (const side of ["우측", "좌측"]) {
    const name = `${side} ${s.base}`;
    if (!views.has(name)) views.set(name, view);
  }
}
function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > 20_000) throw new Error("문자열 형식 또는 길이 오류");
  return value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\bon\w+\s*=\s*["']/gi, "");
}
function score(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}
export function normalizeExchangeNote(value: unknown): NoteData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("노트 형식 오류");
  const n = value as Record<string, unknown>;
  if (typeof n.id !== "string" || !n.id || typeof n.savedAt !== "string" || !n.savedAt) throw new Error("노트 식별자 누락");
  const result = { ...EMPTY_NOTE, ...n } as unknown as NoteData;
  for (const field of fields) result[field] = text(n[field]);
  if (n.patientId != null && typeof n.patientId !== "string") throw new Error("환자 식별자 오류");
  if (n.therapistUid != null && typeof n.therapistUid !== "string") throw new Error("치료사 식별자 오류");
  if (n.therapist != null) {
    const t = n.therapist as Record<string, unknown>;
    if (typeof t !== "object" || typeof t.uid !== "string" || typeof t.name !== "string" || !["master", "therapist"].includes(String(t.role))) throw new Error("치료사 정보 오류");
  }
  for (const field of ["createdBy", "updatedBy"] as const) {
    if (n[field] != null) result[field] = normalizeExchangeTherapist(n[field]);
  }
  for (const field of ["hospitalId", "createdAt", "updatedAt"] as const) {
    if (n[field] != null) result[field] = text(n[field]);
  }
  result.painScore = score(n.painScore); result.painScoreAfter = score(n.painScoreAfter);
  if (n.rom != null && !Array.isArray(n.rom)) throw new Error("ROM 형식 오류");
  result.rom = ((n.rom ?? []) as Record<string, unknown>[]).map(r => {
    if (!r || typeof r !== "object") throw new Error("ROM 형식 오류");
    return normalizeRom(r);
  });
  const pa = n.painAreas;
  if (pa == null) result.painAreas = [];
  else if (Array.isArray(pa)) result.painAreas = pa.map(p => {
    if (!p || typeof p !== "object" || !["anterior", "posterior"].includes(p.view) || ![1, 2, 3].includes(p.painLevel) || typeof p.region !== "string") throw new Error("통증 부위 형식 오류");
    return { view: p.view, region: p.region, painLevel: p.painLevel };
  });
  else if (typeof pa === "object") result.painAreas = Object.entries(pa).map(([region, level]) => {
    if (![1, 2, 3].includes(level as number)) throw new Error("통증 부위 범위 오류");
    return { view: views.get(region) ?? "anterior", region, painLevel: level as 1 | 2 | 3 };
  });
  else throw new Error("통증 부위 형식 오류");
  return result;
}
export function normalizeExchangeTherapist(value: unknown): TherapistRecord {
  if (!value || typeof value !== "object") throw new Error("치료사 형식 오류");
  const t = value as Record<string, unknown>;
  if (typeof t.uid !== "string" || !t.uid || typeof t.name !== "string" || !["master", "therapist"].includes(String(t.role)) || (t.id != null && typeof t.id !== "string") || (t.passwordHash != null && typeof t.passwordHash !== "string")) throw new Error("치료사 형식 오류");
  return { uid: t.uid, name: t.name, id: (t.id ?? null) as string | null, role: t.role as TherapistRecord["role"], resigned: t.resigned === true, passwordHash: (t.passwordHash ?? "") as string };
}
export function parseExchangeBackup(value: unknown): ExchangeBackup & { skippedCount: number; duplicateCount: number } {
  if (!value || typeof value !== "object") throw new Error("백업 파일 형식이 올바르지 않습니다.");
  const v = value as Record<string, unknown>;
  if (v.version != null && ![1, 2, 3].includes(v.version as number)) throw new Error("지원하지 않는 백업 버전입니다.");
  if (v.app != null && !["PT-NOTE", "pt-progress-note"].includes(String(v.app))) throw new Error("지원하지 않는 백업 앱입니다.");
  if (!Array.isArray(v.notes) || (v.therapists != null && !Array.isArray(v.therapists))) throw new Error("백업 파일에 올바른 노트/치료사 배열이 없습니다.");
  const notes: NoteData[] = [], therapists: TherapistRecord[] = [];
  const ids = new Set<string>(), uids = new Set<string>();
  let skippedCount = 0, duplicateCount = 0;
  for (const raw of v.notes) {
    try { const n = normalizeExchangeNote(raw); if (ids.has(n.id!)) { duplicateCount++; continue; } ids.add(n.id!); notes.push(n); }
    catch { skippedCount++; }
  }
  for (const raw of (v.therapists ?? []) as unknown[]) {
    try { const t = normalizeExchangeTherapist(raw); if (uids.has(t.uid)) { duplicateCount++; continue; } uids.add(t.uid); therapists.push(t); }
    catch { skippedCount++; }
  }
  return { app: "PT-NOTE", version: 3, exportedAt: typeof v.exportedAt === "string" ? v.exportedAt : new Date().toISOString(), reason: v.reason === "auto" ? "auto" : "manual", notes, therapists, skippedCount, duplicateCount };
}
export function reconcilePatients(incoming: NoteData[], existing: NoteData[]): void {
  const remap = new Map<string, string>(), pool = [...existing];
  for (const note of incoming) {
    const chart = note.chartNo?.trim(), name = note.patientName?.trim(), birth = note.birthDate?.trim();
    const match = pool.find(n => n.patientId && ((chart && n.chartNo?.trim() === chart) || (!chart && name && birth && n.patientName?.trim() === name && n.birthDate?.trim() === birth)));
    const old = note.patientId;
    note.patientId = match?.patientId || (old && remap.get(old)) || old || `patient-${crypto.randomUUID()}`;
    if (old) remap.set(old, note.patientId!);
    pool.push(note);
  }
}
export function mergeTherapists(incoming: TherapistRecord[], existing: TherapistRecord[]): { added: TherapistRecord[]; duplicates: number } {
  const uids = new Set(existing.map(t => t.uid)), ids = new Set(existing.filter(t => !t.resigned && t.id).map(t => t.id));
  const added: TherapistRecord[] = []; let duplicates = 0;
  for (const t of incoming) {
    if (t.role === "master" || uids.has(t.uid) || (t.id && !t.resigned && ids.has(t.id))) { duplicates++; continue; }
    added.push(t); uids.add(t.uid); if (!t.resigned && t.id) ids.add(t.id);
  }
  return { added, duplicates };
}
export function describeImport(result: ImportResult): string {
  return `가져오기 완료: 노트 ${result.notesCount}건, 치료사 ${result.therapistsCount}명 추가\n중복·기존 관리자 제외 ${result.duplicateCount}건 / 형식 오류 제외 ${result.skippedCount}건`;
}
