import { afterEach, expect, it, vi } from "vitest";
import { encryptData, invalidateEncKeyCache } from "@/lib/cryptoService";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockRejectedValue(new Error("keyring unavailable")) }));
afterEach(() => { Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); invalidateEncKeyCache(); });
it("does not fall back to localStorage when OS keyring access fails", async () => {
  localStorage.clear(); invalidateEncKeyCache();
  const legacyKey = "ab".repeat(32); localStorage.setItem("pt_enc_key_v1", legacyKey);
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  await expect(encryptData("clinical data")).rejects.toThrow("keyring unavailable");
  expect(localStorage.getItem("pt_enc_key_v1")).toBe(legacyKey);
  expect(localStorage.getItem("pt_local_notes")).toBeNull();
});
