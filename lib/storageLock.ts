/** Shared origin-wide locks; unsafe localStorage lease fallbacks are deliberately not used. */
export async function withBrowserLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    return Promise.reject(new Error("안전한 저장을 지원하지 않는 환경입니다. 최신 브라우저의 HTTPS 또는 최신 앱에서 열어주세요."));
  }
  return await navigator.locks.request(name, { mode: "exclusive" }, action);
}
const JOURNAL = "pt_pending_write_v1";
const KEYS = ["pt_local_notes", "pt_local_therapists", "pt_record_history_v1"];
function recoverPendingWrite(): void {
  const raw = localStorage.getItem(JOURNAL);
  if (!raw) return;
  const previous: unknown = JSON.parse(raw);
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) throw new Error("가져오기 복구 정보가 손상되었습니다.");
  const entries = Object.entries(previous);
  if (!entries.length || entries.some(([key, value]) => !KEYS.includes(key) || (value !== null && typeof value !== "string"))) throw new Error("가져오기 복구 정보가 손상되었습니다.");
  for (const [key, value] of entries) {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value as string);
  }
  localStorage.removeItem(JOURNAL);
}
export function withDataLock<T>(action: () => Promise<T>): Promise<T> {
  return withBrowserLock("pt-note:data:v1", async () => { recoverPendingWrite(); return action(); });
}
/** Inside withDataLock only. The undo journal retains encrypted note bytes. */
export function commitData(values: Record<string, string>): void {
  const previous = Object.fromEntries(Object.keys(values).map(key => {
    if (!KEYS.includes(key)) throw new Error("지원하지 않는 저장 항목입니다.");
    return [key, localStorage.getItem(key)];
  }));
  localStorage.setItem(JOURNAL, JSON.stringify(previous));
  try {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    localStorage.removeItem(JOURNAL);
  } catch {
    try { recoverPendingWrite(); } catch { /* retry from durable journal on next access */ }
    throw new Error("기록·이력 저장에 실패했습니다. 원본 복구 정보를 보존했습니다. 저장 공간을 확인해주세요.");
  }
}
