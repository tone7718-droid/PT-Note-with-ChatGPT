/**
 * 로컬 타임존 기준 오늘 날짜 "YYYY-MM-DD".
 * toISOString() 은 UTC 기준이라 KST 에서는 자정~08:59 사이에 전날 날짜가
 * 나온다 — 의무기록 작성일자가 하루 밀리는 것을 막기 위해 로컬 기준으로 계산.
 */
export function todayLocalISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
