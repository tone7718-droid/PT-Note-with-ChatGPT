import { requireMaster } from "@/lib/accessControl";
import { flushEditor } from "@/lib/editorDraft";
import type { ImportResult } from "@/lib/backupExchange";
import { create } from "zustand";
import type { NoteData } from "@/types";
import * as ds from "@/lib/localDataService"; // 로컬 전환용
import { useAuthStore } from "./useAuthStore";
import {
  listAutoBackups,
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
  importData: (json: string, passphrase?: string) => Promise<ImportResult>;
  importBackupText: (text: string) => Promise<ImportResult>;
  importEncryptedBackupText: (
    text: string,
    passphrase: string
  ) => Promise<ImportResult>;
  exportDataEncrypted: (passphrase: string) => Promise<string>;
  getAutoBackups: () => AutoBackupEntry[];
  restoreAutoBackup: (id: string) => Promise<ImportResult>;
  initSync: () => void;
}

let storageListenerInstalled = false;

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  isLoading: false,
  error: null,

  selectNote: (id) => {
    if (id === get().selectedNoteId) return;
    void flushEditor().then(() => set({ selectedNoteId: id })).catch((err: Error) => set({ error: err.message }));
  },
  createNewNote: () => get().selectNote(null),

  initSync: () => {
    if (!storageListenerInstalled && typeof window !== "undefined") {
      storageListenerInstalled = true;
      window.addEventListener("storage", (event) => {
        if ((event.key === "pt_local_notes" || event.key === "pt_local_therapists" || event.key === null) && useAuthStore.getState().therapist) {
          void get().refreshNotes();
        }
      });
    }
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
      set({ notes: fetchedNotes, error: null });
    } catch (err) {
      set({ error: (err as Error).message });
      if ((err as Error).message.includes("세션이 만료")) {
        set({ notes: [], selectedNoteId: null });
        useAuthStore.getState().setTherapist(null);
      }
    }
  },

  saveNote: async (data, existingId) => {
    const expectedSavedAt = existingId
      ? (data as Partial<NoteData>).savedAt ?? get().notes.find((note) => note.id === existingId)?.savedAt
      : undefined;
    const now = new Date(Math.max(Date.now(), (Date.parse(expectedSavedAt ?? "") || 0) + 1)).toISOString();
    const noteToSave: NoteData = existingId
      ? { ...data, id: existingId, savedAt: now }
      : { ...data, id: `note-${crypto.randomUUID()}`, savedAt: now };

    try {
      const saved = await ds.upsertNote(noteToSave, expectedSavedAt);
      await get().refreshNotes();
      return saved;
    } catch (err) {
      await get().refreshNotes();
      throw err;
    }
  },

  deleteNotes: async (ids) => {
    await flushEditor();
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
    await get().refreshNotes();
  },

  exportData: async () => {
    return ds.exportAllData();
  },

  exportDataEncrypted: async (passphrase) => {
    return ds.exportAllDataEncrypted(passphrase);
  },

  importEncryptedBackupText: (text, passphrase) => get().importData(text, passphrase),

  importData: async (json, passphrase) => {
    await flushEditor();
    const result = await ds.importCompatibleBackup(json, passphrase);
    const [notes, therapists] = await Promise.all([ds.fetchNotes(), ds.fetchTherapists()]);
    set({ notes, error: null });
    useAuthStore.getState().setTherapists(therapists);
    return result;
  },

  importBackupText: (text) => get().importData(text),

  getAutoBackups: () => { requireMaster(); return listAutoBackups(); },

  restoreAutoBackup: async (id) => {
    await flushEditor();
    const found = listAutoBackups().find((backup) => backup.id === id);
    if (!found) throw new Error("자동 백업을 찾을 수 없습니다.");
    const payload = await readAutoBackupPayload(found);
    const notesCount = await ds.restoreNoteSnapshot(payload.notes);
    set({ notes: await ds.fetchNotes(), selectedNoteId: null, error: null });
    return { notesCount, therapistsCount: 0, skippedCount: 0, duplicateCount: 0 };
  },
}));
