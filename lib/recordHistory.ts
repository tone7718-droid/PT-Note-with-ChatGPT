import type { NoteData, Therapist } from "@/types";
import { encryptData, decryptData } from "@/lib/cryptoService";
import { currentActor, hospitalId } from "@/lib/accessControl";
export interface HistoryEntry {
  source?: { importedAt: string; importedBy: string; originalId: string };
  id: string; noteId: string; at: string; actor: Therapist; action: string;
  changes: Record<string, { before: unknown; after: unknown }>;
}
const KEY = "pt_record_history_v1";
let operation = "save";
export function setHistoryOperation(value: string): void { operation = value; }
export async function readHistory(): Promise<HistoryEntry[]> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(await decryptData(raw));
    if (!Array.isArray(value) || value.some(e => !e || typeof e.id !== "string" || typeof e.noteId !== "string" || typeof e.at !== "string" || !e.actor || !e.changes)) throw new Error();
    return value;
  } catch { throw new Error("수정 이력을 읽을 수 없어 원본 변경을 중단했습니다."); }
}
/** Called inside the data lock. Notes and the append-only local history commit together. */
export async function prepareNotesWrite(notes: NoteData[]): Promise<Record<string, string>> {
  const raw = localStorage.getItem("pt_local_notes");
  const before: NoteData[] = raw ? JSON.parse(raw.trimStart().startsWith("[") ? raw : await decryptData(raw)) : [];
  const actor = currentActor();
  const history = await readHistory();
  const at = new Date(Math.max(Date.now(), (Date.parse(history.filter(entry => !entry.source).at(-1)?.at ?? "") || 0) + 1)).toISOString();
  const oldById = new Map(before.map(n => [n.id, n]));
  const nextById = new Map(notes.map(n => [n.id, n]));
  for (const note of notes) {
    const old = oldById.get(note.id);
    // Original author of legacy/transferred records cannot be reconstructed: leave unknown.
    note.createdBy = old ? old.createdBy ?? null : operation === "upsertNote" ? actor : note.createdBy ?? null;
    note.createdAt = old ? old.createdAt : operation === "upsertNote" ? at : note.createdAt;
    note.hospitalId = hospitalId();
  }
  for (const id of new Set([...oldById.keys(), ...nextById.keys()])) {
    if (!id) throw new Error("기록 식별자가 없습니다.");
    const old = oldById.get(id), next = nextById.get(id);
    const changes: HistoryEntry["changes"] = {};
    for (const field of new Set([...Object.keys(old ?? {}), ...Object.keys(next ?? {})])) {
      if (["updatedBy", "updatedAt"].includes(field)) continue;
      const a = (old as unknown as Record<string, unknown> | undefined)?.[field] ?? null;
      const b = (next as unknown as Record<string, unknown> | undefined)?.[field] ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) changes[field] = { before: a, after: b };
    }
    if (!Object.keys(changes).length) continue;
    if (next) { next.updatedBy = actor; next.updatedAt = at; }
    history.push({ id: crypto.randomUUID(), noteId: id, at, actor, action: !next ? "delete" : operation, changes });
  }
  return { pt_local_notes: await encryptData(JSON.stringify(notes)), [KEY]: await encryptData(JSON.stringify(history)) };
}

/** Preserve external history as explicitly imported evidence, never as locally authenticated events. */
export async function includeImportedHistory(values: Record<string, string>, input: unknown, noteIds: Set<string>): Promise<void> {
  if (input == null) return;
  if (!Array.isArray(input)) throw new Error("백업 수정 이력 형식이 잘못되었습니다.");
  const imported: HistoryEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw.noteId !== "string" || !noteIds.has(raw.noteId)) continue;
    if (typeof raw.id !== "string" || typeof raw.at !== "string" || !Number.isFinite(Date.parse(raw.at)) || typeof raw.action !== "string" || !raw.actor || typeof raw.actor.uid !== "string" || typeof raw.actor.name !== "string" || !["master", "therapist"].includes(raw.actor.role) || !raw.changes || typeof raw.changes !== "object" || Array.isArray(raw.changes)) throw new Error("백업 수정 이력이 손상되어 가져오기를 중단했습니다.");
    for (const change of Object.values(raw.changes)) if (!change || typeof change !== "object" || !("before" in change) || !("after" in change)) throw new Error("백업 변경 내용이 잘못되었습니다.");
    imported.push({ ...raw, id: crypto.randomUUID(), source: { importedAt: new Date().toISOString(), importedBy: currentActor().uid, originalId: raw.id } });
  }
  if (!imported.length) return;
  const entries: HistoryEntry[] = values[KEY] ? JSON.parse(await decryptData(values[KEY])) : await readHistory();
  values[KEY] = await encryptData(JSON.stringify([...entries, ...imported]));
}
