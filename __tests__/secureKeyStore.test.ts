// ported from pt-note-with-antigravity (Electron safeStorage → Tauri keyring 로 변환)
import { afterEach, expect, it, vi } from "vitest";
import { encryptData, decryptData, invalidateEncKeyCache } from "@/lib/cryptoService";

const store: { key: string | null } = { key: null };
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { value: string }) => {
    if (cmd === "keyring_get_enc_key") return store.key;
    if (cmd === "keyring_set_enc_key") { store.key = args!.value; return; }
    throw new Error(`unexpected command ${cmd}`);
  }),
}));
afterEach(() => { Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); invalidateEncKeyCache(); localStorage.clear(); store.key = null; });

it("migrates a legacy localStorage key into the OS keyring", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  const legacyKey = "ab".repeat(32); localStorage.setItem("pt_enc_key_v1", legacyKey); invalidateEncKeyCache();
  expect(await decryptData(await encryptData("clinical data"))).toBe("clinical data");
  expect(store.key).toBe(legacyKey);
  expect(localStorage.getItem("pt_enc_key_v1")).toBeNull();
});
