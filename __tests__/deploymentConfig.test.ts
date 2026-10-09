import { expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
it("keeps iOS and Capacitor application identifiers aligned", () => {
  const config = readFileSync("capacitor.config.ts", "utf8");
  const xcode = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  expect(config).toContain("com.ptclinic.ptnote3");
  const ids = [...xcode.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(m => m[1]);
  expect(ids.length).toBeGreaterThan(0); expect(new Set(ids)).toEqual(new Set(["com.ptclinic.ptnote3"]));
});

// ported from pt-note-with-antigravity (electron-builder win.icon → Tauri bundle.icon 로 변환)
it("references existing Windows application icons", () => {
  const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const icons: string[] = conf.bundle.icon;
  for (const icon of icons) expect(existsSync(`src-tauri/${icon}`)).toBe(true);
  const ico = icons.find((i) => i.endsWith(".ico"));
  expect(ico).toBeDefined();
  expect([...readFileSync(`src-tauri/${ico}`).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
});
