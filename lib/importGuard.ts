import type { NoteData } from "@/types";

const textFields = [
  "id", "savedAt", "patientName", "chartNo", "birthDate", "gender",
  "diagnosis", "pmh", "chiefComplaint", "postural", "palpation",
  "specialTest", "treatment", "homeExercise", "noteDate",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntry(value: unknown): value is NoteData {
  if (!isObject(value)) return false;
  if (!textFields.every((key) => typeof value[key] === "string")) return false;
  if (!(value.painScore === null || (typeof value.painScore === "number" && value.painScore >= 0 && value.painScore <= 10))) return false;
  if (!Array.isArray(value.painAreas) || !Array.isArray(value.rom)) return false;
  return value.rom.every((row) => isObject(row) && typeof row.joint === "string" && typeof row.measuredROM === "string" && typeof row.normalRange === "string");
}

export function guardImportedEntries(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Invalid import data");
  const accepted = value.filter(isEntry);
  return { accepted, rejected: value.length - accepted.length };
}
