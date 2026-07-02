import { create } from "zustand";
import type { NoteData } from "@/types";
import * as ds from "@/lib/localDataService"; // 로컬 전환용
import { useAuthStore } from "./useAuthStore";
import {
  listAutoBackups,
  parsePlainBackupText,
  readAutoBackupPayload,
  type AutoBackupEntry,
} from "@/lib/backupService";

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
  importData: (json: string) => Promise<{ notesCount: number; therapistsCount: number }>;
  importBackupText: (text: string) => Promise<{ notesCount: number; therapistsCount: number }>;
  getAutoBackups: () => AutoBackupEntry[];
  restoreAutoBackup: (id: string) => Promise<{ notesCount: number; therapistsCount: number }>;
  initSync: () => void;
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  isLoading: false,
  error: null,

  selectNote: (id) => set({ selectedNoteId: id }),
  createNewNote: () => set({ selectedNoteId: null }),

  initSync: () => {
    // Auth 상태 리스너 등록 (cleanup은 앱 생명주기 동안 유지하므로 subscription 미보관)
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

    // Cleanup은 이 스토어 생명주기 동안 유지하므로 생략하거나 애플리케이션 종료시 처리
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

    // Optimistic Update
    set((state) => {
      const updated = existingId
        ? state.notes.map((n) => (n.id === existingId ? noteToSave : n))
        : [noteToSave, ...state.notes];
      return { 
        notes: updated.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()),
        selectedNoteId: noteToSave.id
      };
    });

    try {
      const saved = await ds.upsertNote(noteToSave);
      set((state) => ({
        notes: state.notes
          .map((n) => (n.id === saved.id ? saved : n))
          .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      }));
      return saved;
    } catch (err) {
      // rollback
      get().refreshNotes();
      throw err;
    }
  },

  deleteNotes: async (ids) => {
    set((state) => ({
      notes: state.notes.filter((n) => !ids.includes(n.id)),
      selectedNoteId: state.selectedNoteId && ids.includes(state.selectedNoteId) ? null : state.selectedNoteId
    }));

    try {
      await ds.deleteNotes(ids);
    } catch (err) {
      get().refreshNotes();
      throw err;
    }
  },

  transferNotes: async (fromUid, toUid, toName, toLoginId) => {
    await ds.transferNotesRpc(fromUid, toUid, toName, toLoginId);
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.therapistUid === fromUid) {
          return {
            ...n,
            therapistUid: toUid,
            therapist: { uid: toUid, id: toLoginId, name: toName, role: "therapist" as const },
          };
        }
        return n;
      })
    }));
  },

  exportData: async () => {
    return ds.exportAllData();
  },

  importData: async (json) => {
    const data = JSON.parse(json);
    if (!data.notes || !Array.isArray(data.notes)) throw new Error("잘못된 데이터 형식입니다.");

    const notesCount = await ds.importNotes(data.notes);
    const updatedNotes = await ds.fetchNotes();
    set({ notes: updatedNotes });

    return { notesCount, therapistsCount: 0 };
  },

  importBackupText: async (text) => {
    const payload = parsePlainBackupText(text);

    const result = await ds.importBackupPayload(payload);
    const [updatedNotes, updatedTherapists] = await Promise.all([
      ds.fetchNotes(),
      ds.fetchTherapists(),
    ]);
    set({ notes: updatedNotes });
    useAuthStore.getState().setTherapists(updatedTherapists);
    return result;
  },

  getAutoBackups: () => listAutoBackups(),

  restoreAutoBackup: async (id) => {
    const found = listAutoBackups().find((backup) => backup.id === id);
    if (!found) throw new Error("자동 백업을 찾을 수 없습니다.");
    const payload = await readAutoBackupPayload(found);
    const result = await ds.importBackupPayload(payload);
    const [updatedNotes, updatedTherapists] = await Promise.all([
      ds.fetchNotes(),
      ds.fetchTherapists(),
    ]);
    set({ notes: updatedNotes });
    useAuthStore.getState().setTherapists(updatedTherapists);
    return result;
  },
}));
