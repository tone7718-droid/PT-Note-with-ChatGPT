import type { RomMeasurement, NoteData } from "@/types";
export function normalizeRom(raw: Record<string, unknown>): RomMeasurement {
  const string = (key: string) => {
    const value = raw[key];
    if (value == null) return "";
    if (typeof value !== "string" || value.length > 20000) throw new Error("ROM 문자 형식 오류");
    return value;
  };
  const angle = (key: string) => {
    const value = raw[key];
    if (value == null || value === "") return null;
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 360) throw new Error("ROM 각도 형식 오류");
    return value;
  };
  if (raw.side != null && !["", "left", "right", "both"].includes(String(raw.side))) throw new Error("ROM 좌우 형식 오류");
  if (raw.mode != null && !["", "AROM", "PROM"].includes(String(raw.mode))) throw new Error("ROM 측정 방식 오류");
  return { joint: string("joint"), measuredROM: string("measuredROM"), normalRange: string("normalRange"), movement: string("movement"), side: (raw.side ?? "") as RomMeasurement["side"], mode: (raw.mode ?? "") as RomMeasurement["mode"], startAngle: angle("startAngle"), endAngle: angle("endAngle") };
}
export function romAngles(row: RomMeasurement): { start: number | null; end: number | null } | null {
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 360;
  if (row.startAngle != null || row.endAngle != null) return { start: valid(row.startAngle) ? row.startAngle : null, end: valid(row.endAngle) ? row.endAngle : null };
  const text = row.measuredROM.trim();
  const number = "([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))";
  const range = text.match(new RegExp(`^${number}\\s*°?\\s*(?:~|–|—|to|-)\\s*${number}\\s*°?$`, "i"));
  if (range && valid(Number(range[1])) && valid(Number(range[2]))) return { start: Number(range[1]), end: Number(range[2]) };
  const scalar = text.match(new RegExp(`^${number}\\s*°?$`));
  return scalar && valid(Number(scalar[1])) ? { start: null, end: Number(scalar[1]) } : null;
}
export function romKey(row: RomMeasurement): string { return JSON.stringify([row.joint.trim(), row.movement?.trim() ?? "", row.side ?? "", row.mode ?? ""]); }
export function romLabel(row: RomMeasurement): string {
  return [row.joint, row.movement, ({ left: "좌", right: "우", both: "양측", "": "좌우 미지정" })[row.side ?? ""], row.mode || "측정 방식 미지정"].filter(Boolean).join(" · ");
}
export function romSeries(notes: NoteData[], key: string) {
  return notes.map(note => {
    const rows = note.rom.filter(row => romKey(row) === key);
    const angles = rows.length === 1 ? romAngles(rows[0]) : null;
    return { date: note.noteDate || note.savedAt || "", start: angles?.start ?? null, end: angles?.end ?? null, ambiguous: rows.length > 1 || (rows.length === 1 && !angles) };
  });
}
