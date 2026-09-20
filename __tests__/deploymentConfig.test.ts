import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
it("keeps iOS and Capacitor application identifiers aligned", () => {
  const config = readFileSync("capacitor.config.ts", "utf8");
  const xcode = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  expect(config).toContain("com.ptclinic.ptnote3");
  const ids = [...xcode.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(m => m[1]);
  expect(ids.length).toBeGreaterThan(0); expect(new Set(ids)).toEqual(new Set(["com.ptclinic.ptnote3"]));
});
