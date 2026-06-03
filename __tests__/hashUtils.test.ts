import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isLegacyHash } from "@/components/hashUtils";

describe("hashUtils — PBKDF2", () => {
  it("hashPassword returns pbkdf2v1 prefixed string", async () => {
    const hash = await hashPassword("0000");
    expect(hash).toMatch(/^pbkdf2v1:[0-9a-f]{32}:[0-9a-f]{64}$/);
  });

  it("hashPassword produces different output each call (salt is random)", async () => {
    const a = await hashPassword("0000");
    const b = await hashPassword("0000");
    expect(a).not.toBe(b); // 솔트가 다르므로 해시도 다름
  });

  it("verifyPassword returns true for matching password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("isLegacyHash identifies old SHA-256 hashes", () => {
    const sha256 = "9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0";
    expect(isLegacyHash(sha256)).toBe(true);
    expect(isLegacyHash("pbkdf2v1:aabbcc:ddeeff")).toBe(false);
  });

  it("verifyPassword still works for legacy SHA-256 hashes (migration path)", async () => {
    // SHA-256("0000") — 레거시 해시
    const legacyHash = "9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0";
    expect(await verifyPassword("0000", legacyHash)).toBe(true);
    expect(await verifyPassword("wrong", legacyHash)).toBe(false);
  });
});
