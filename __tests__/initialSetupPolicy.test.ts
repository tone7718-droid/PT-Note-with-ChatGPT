import { beforeEach, expect, it } from "vitest";
import { setupInitialMaster, isSetupRequired } from "@/lib/localDataService";
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
it("applies the shared password policy to the initial administrator", async () => {
  await expect(setupInitialMaster("관리자", "a".repeat(21))).rejects.toThrow("8~20");
  await expect(setupInitialMaster("관리자", "pass word1")).rejects.toThrow();
  await expect(setupInitialMaster("관리자", "비밀번호비밀번호")).rejects.toThrow();
  expect(await isSetupRequired()).toBe(true);
  await setupInitialMaster("관리자", "Test-pass-1!");
  expect(await isSetupRequired()).toBe(false);
});
