/** Built-app regression test. Run npm run build, then npm run test:e2e. Synthetic data only. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = fileURLToPath(new URL("../out/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    res.setHeader("Content-Type", types[extname(path)] || "text/plain"); res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("heading", { name: "최초 관리자 설정" }).waitFor();
  await page.getByLabel("관리자 이름", { exact: true }).fill("테스트 관리자");
  await page.getByLabel("비밀번호(8자 이상)", { exact: true }).fill("Test-pass-1!");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("Test-pass-1!");
  await page.getByRole("button", { name: "관리자 설정 완료" }).click();
  const patient = page.locator('input[name="patientName"]');
  const diagnosis = page.locator('input[name="diagnosis"]');
  await patient.waitFor(); await patient.fill("테스트 환자 A"); await diagnosis.fill("초안 진단");
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith("pt_editor_draft_v1:")), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("pt_local_notes")), null, "draft must not create a clinical record");
  await page.reload(); await page.getByRole("button", { name: "초안 복구", exact: true }).first().click();
  assert.equal(await diagnosis.inputValue(), "초안 진단");
  await page.getByRole("button", { name: "새 노트 저장", exact: true }).click();
  await page.getByRole("button", { name: "수정 저장", exact: true }).waitFor();
  await diagnosis.fill("수정 중 진단");
  assert.equal(await diagnosis.inputValue(), "수정 중 진단");
  // Switching records must flush immediately, even before the five-second interval.
  await page.getByRole("button", { name: "새 노트 작성", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('input[name="patientName"]').value === "");
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("pt_editor_draft_v1:") && !key.includes(":new:"))), "existing-record draft must survive navigation/logout");
  await page.locator("li").filter({ hasText: "테스트 환자 A" }).first().click();
  await page.getByRole("button", { name: "초안 복구", exact: true }).first().click();
  assert.equal(await diagnosis.inputValue(), "수정 중 진단");
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await page.getByRole("button", { name: "수정 이력 조회" }).click();
  await page.getByText("이후: 수정 중 진단", { exact: true }).waitFor({ state: "attached" });
  await diagnosis.fill("로그아웃 전 미저장");
  await page.getByRole("button", { name: "로그아웃", exact: true }).first().click();
  await page.locator('#login-id').fill("master"); await page.locator('#login-pw').fill("Test-pass-1!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("pt_editor_draft_v1:") && !key.includes(":new:"))), "existing-record draft must survive navigation/logout");
  await page.locator("li").filter({ hasText: "테스트 환자 A" }).first().click();
  await page.getByRole("button", { name: "초안 복구", exact: true }).first().click();
  assert.equal(await diagnosis.inputValue(), "로그아웃 전 미저장");
  assert.deepEqual(errors, [], "page must not raise runtime errors");
  console.log("PASS: setup, draft-only autosave, reload recovery, record-switch recovery, save history, logout recovery");
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
