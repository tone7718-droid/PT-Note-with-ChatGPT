import { describe, it, expect } from "vitest";
import { verifyPassword, isLegacyHash } from "@/lib/hashUtils";

// 구 Antigravity 포맷 (PBKDF2-SHA256 120k, base64) — "secret123"
const OLD_B64 = "pbkdf2$120000$ABEiM0RVZneImaq7zN3u/w==$rS7IvCTIIHV+oxTCZcRq4XYqJW5oCrTnIFTGBkLgf/A=";

describe("hashUtils — 자매 앱 해시 호환", () => {
  it("verifies the old pbkdf2$ format and marks it for upgrade", async () => {
    expect(await verifyPassword("secret123", OLD_B64)).toBe(true);
    expect(await verifyPassword("wrong", OLD_B64)).toBe(false);
    expect(isLegacyHash(OLD_B64)).toBe(true);
  });

  it("rejects pbkdf2$ hashes with out-of-range iteration counts", async () => {
    const [, , salt, hash] = OLD_B64.split("$");
    expect(await verifyPassword("secret123", `pbkdf2$1000$${salt}$${hash}`)).toBe(false);
    expect(await verifyPassword("secret123", `pbkdf2$99999999$${salt}$${hash}`)).toBe(false);
  });
});
