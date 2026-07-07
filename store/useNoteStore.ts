import { create } from "zustand";
import type { NoteData } from "@/types";
import * as ds from "@/lib/localDataService";
import { useAuthStore } from "./useAuthStore";
import { guardImportedEntries } from "@/lib/importGuard";
import {
  listAutoBackups,
  parsePlainBackupText,
  readAutoBackupPayload,
  type AutoBackupEntry,
} from "@/lib/backupService";

interface ImportResult {
  notesCount: number;
  therapistsCount: number;
  skippedCount: number;
}

interface NoteStore {
  notes: NoteData[];
  selectedNoteId: string | null;
  isLoading: boolean;
  error: string | null;

  selectNote: (id: string | null) => void;
  createNewNote: () => void;
  refreshNotes: () => Promise<void>;
  saveNote: (data: Omit<NoteData, "id" | "savedAt">, existingId?: string | null) => Promise<NoteData>;
  deleteNotes: (ids: string[]) => Promise<void>;
  transferNotes: (fromUid: string, toUid: string, toName: string, toLoginId: string | null) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (json: string) => Promise<ImportResult>;
  importBackupText: (text: string) => Promise<ImportResult>;
  getAutoBackups: () => AutoBackupEntry[];
  restoreAutoBackup: (id: string) => Promise<{ notesCount: number; therapistsCount: number }>;
  initSync: () => void;
}

function requireUsableImport(source: unknown, accepted: NoteData[]) {
  if (Array.isArray(source) && source.length > 0 && accepted.length === 0) {
    throw new Error("가져올 수 있는 정상 노트가 없습니다.");
  }
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  isLoading: false,
  error: null,

  selectNote: (id) => set({ selectedNoteId: id }),
  createNewNote: () => set({ selectedNoteId: null }),

  initSync: () => {
    ds.onAuthStateChange(async (t) => {
      useAuthStore.getState().setTherapist(t);
      if (t) {
        set({ isLoading: true });
        try {
          const [fetchedNotes, fetchedTherapists] = await Promise.all([
            ds.fetchNotes(),
            ds.fetchTherapists(),
          ]);
          set({ notes: fetchedNotes, error: null });
          useAuthStore.getState().setTherapists(fetchedTherapists);
        } catch (err) {
          console.error("[init] fetch after auth failed:", err);
          set({ error: (err as Error).message });
        } finally {
          set({ isLoading: false });
        }
      } else {
        set({ notes: [] });
        useAuthStore.getState().setTherapists([]);
      }
    });
  },

  refreshNotes: async () => {
    try {
      const fetchedNotes = await ds.fetchNotes();
      set({ notes: fetchedNotes });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  saveNote: async (data, existingId) => {
    const now = new Date().toISOString();
    const noteToSave: NoteData = existingId
      ? { ...data, id: existingId, savedAt: now }
      : { ...data, id: `note-${Date.now()}`, savedAt: now };

    set((state) => {
      const updated = existingId
        ? state.notes.map((n) => (n.id === existingId ? noteToSave : n))
        : [noteToSave, ...state.notes];
      return {
        notes: updated.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()),
        selectedNoteId: noteToSave.id,
      };
    });

    try {
      const saved = await ds.upsertNote(noteToSave);
      set((state) => ({
        notes: state.notes
          .map((n) => (n.id === saved.id ? saved : n))
          .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()),
      }));
      return saved;
    } catch (err) {
      void get().refreshNotes();
      throw err;
    }
  },

  deleteNotes: async (ids) => {
    set((state) => ({
      notes: state.notes.filter((n) => !ids.includes(n.id)),
      selectedNoteId: state.selectedNoteId && ids.includes(state.selectedNoteId) ? null : state.selectedNoteId,
    }));

    try {
      await ds.deleteNotes(ids);
    } catch (err) {
      void get().refreshNotes();
      throw err;
    }
  },

  transferNotes: async (fromUid, toUid, toName, toLoginId) => {
    await ds.transferNotesRpc(fromUid, toUid, toName, toLoginId);
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.therapistUid !== fromUid) return n;
        return {
          ...n,
          therapistUid: toUid,
          therapist: { uid: toUid, id: toLoginId, name: toName, role: "therapist" as const },
        };
      }),
    }));
  },

  exportData: async () => ds.exportAllData(),

  importData: async (json) => {
    const data = JSON.parse(json) as { notes?: unknown };
    const { accepted, rejected } = guardImportedEntries(data.notes);
    requireUsableImport(data.notes, accepted);

    const notesCount = await ds.importNotes(accepted);
    set({ notes: await ds.fetchNotes() });
    return { notesCount, therapistsCount: 0, skippedCount: rejected };
  },

  importBackupText: async (text) => {
    const payload = parsePlainBackupText(text);
    const { accepted, rejected } = guardImportedEntries(payload.notes);
    requireUsableImport(payload.notes, accepted);

    const result = await ds.importBackupPayload({ ...payload, notes: accepted });
    const [updatedNotes, updatedTherapists] = await Promise.all([
      ds.fetchNotes(),
      ds.fetchTherapists(),
    ]);
    set({ notes: updatedNotes });
    useAuthStore.getState().setTherapists(updatedTherapists);
    return { ...result, skippedCount: rejected };
  },

  getAutoBackups: () => listAutoBackups(),

  restoreAutoBackup: async (id) => {
    const found = listAutoBackups().find((backup) => backup.id === id);
    if (!found) throw new Error("자동 백업을 찾을 수 없습니다.");
    const payload = await readAutoBackupPayload(found);
    const { accepted } = guardImportedEntries(payload.notes);
    requireUsableImport(payload.notes, accepted);
    const result = await ds.importBackupPayload({ ...payload, notes: accepted });
    const [updatedNotes, updatedTherapists] = await Promise.all([
      ds.fetchNotes(),
      ds.fetchTherapists(),
    ]);
    set({ notes: updatedNotes });
    useAuthStore.getState().setTherapists(updatedTherapists);
    return result;
  },
}));
