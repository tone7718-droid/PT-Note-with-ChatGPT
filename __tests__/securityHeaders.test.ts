import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
it("serves the web build with clickjacking and content-security headers", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  const headers = Object.fromEntries(config.headers.find((h: { source: string }) => h.source === "/(.*)").headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
});
