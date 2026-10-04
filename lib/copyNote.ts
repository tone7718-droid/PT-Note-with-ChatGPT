import { type NoteData } from "@/types";
import { todayLocalISO } from "@/lib/localDate";
export function copyNote(note: NoteData, otherPatient = false): NoteData {
  const copy = structuredClone(note);
  return { ...copy, id: "", savedAt: "", noteDate: todayLocalISO(), therapist: null, therapistUid: "",
    createdBy: null, updatedBy: null, createdAt: undefined, updatedAt: undefined, hospitalId: undefined,
    ...(otherPatient ? { patientId: undefined, patientName: "", chartNo: "", birthDate: "", gender: "", painScore: null, painScoreAfter: null, painAreas: [] } : {}) };
}
