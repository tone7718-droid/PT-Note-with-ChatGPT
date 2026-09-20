import { seedLegacyAdmin } from "./testAuth";
import { beforeEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as ds from "@/lib/localDataService";
import { invalidateEncKeyCache } from "@/lib/cryptoService";
beforeEach(async () => { await seedLegacyAdmin(); invalidateEncKeyCache(); });
for (const producer of ["progress", "antigravity", "chatgpt"]) for (const format of ["plain", "encrypted"]) {
  it(`imports actual ${producer} ${format} export`, async () => {
    const json = readFileSync(`${process.cwd()}/__tests__/fixtures/exchange/cross-${producer}-${format}.json`, "utf8");
    expect(await ds.importCompatibleBackup(json, "test-password")).toMatchObject({ notesCount: 1, therapistsCount: 1, skippedCount: 0 });
    expect((await ds.fetchNotes())[0]).toMatchObject({ treatment: "교환 내용", painScore: 4, chartNo: "cross-chart" });
    expect((await ds.fetchTherapists()).find(t => t.id === "PT-007")?.name).toBe("교차 검증");
  });
}