import { create } from "zustand";
import type { Therapist, TherapistRecord } from "@/types";
import * as ds from "@/lib/localDataService"; // 로컬 전환용. 나중에 dataService로 바꿀 수 있음.

interface AuthStore {
  therapist: Therapist | null;
  therapists: TherapistRecord[];
  isLoading: boolean;
  error: string | null;
  /** 기본 비밀번호("0000")로 로그인한 상태 — 변경 안내 배너 표시용 */
  needsPasswordChange: boolean;
  setTherapist: (t: Therapist | null) => void;
  setTherapists: (ts: TherapistRecord[]) => void;
  signIn: (loginId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reauthenticate: (loginId: string, password: string) => Promise<boolean>;
  registerTherapist: (loginId: string, name: string, password: string) => Promise<void>;
  resignTherapist: (uid: string) => Promise<void>;
  deleteTherapist: (uid: string) => Promise<void>;
  updateTherapistPassword: (newPassword: string) => Promise<void>;
  /** master 전용 — 백업 복원으로 잠긴(비밀번호 미설정) 계정 활성화 포함 */
  resetTherapistPassword: (uid: string, newPassword: string) => Promise<void>;
  setError: (err: string | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  therapist: null,
  therapists: [],
  isLoading: false,
  error: null,
  needsPasswordChange: false,

  setTherapist: (t) => set({ therapist: t }),
  setTherapists: (ts) => set({ therapists: ts }),
  setError: (err) => set({ error: err }),
  setLoading: (isLoading) => set({ isLoading }),

  signIn: async (loginId, password) => {
    set({ isLoading: true, error: null });
    try {
      const { therapist: t, usingDefaultPassword } = await ds.signIn(loginId, password);
      set({ therapist: t, needsPasswordChange: usingDefaultPassword });
      const fetchedTherapists = await ds.fetchTherapists();
      set({ therapists: fetchedTherapists });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await ds.signOut();
    set({ therapist: null, therapists: [], needsPasswordChange: false });
  },

  reauthenticate: async (loginId, password) => {
    return ds.reauthenticate(loginId, password);
  },

  registerTherapist: async (loginId, name, password) => {
    const newRecord = await ds.createTherapist(loginId, name, password);
    set((state) => ({ therapists: [...state.therapists, newRecord] }));
  },

  resignTherapist: async (uid) => {
    await ds.resignTherapistDb(uid);
    set((state) => ({
      therapists: state.therapists.map((t) =>
        t.uid === uid ? { ...t, id: null, resigned: true } : t
      ),
    }));
  },

  deleteTherapist: async (uid) => {
    await ds.deleteTherapistDb(uid);
    set((state) => ({
      therapists: state.therapists.filter((t) => t.uid !== uid),
    }));
  },

  updateTherapistPassword: async (newPassword) => {
    await ds.updateTherapistPassword(newPassword);
    set({ needsPasswordChange: false });
  },

  resetTherapistPassword: async (uid, newPassword) => {
    await ds.resetTherapistPasswordDb(uid, newPassword);
    const fetched = await ds.fetchTherapists();
    set({ therapists: fetched });
  },
}));
