import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useForm, FormProvider, type UseFormReturn } from "react-hook-form";
import { beforeEach, afterEach, expect, it } from "vitest";
import { EMPTY_NOTE, type NoteData } from "@/types";
import { seedLegacyAdmin } from "./testAuth";
import { currentActor } from "@/lib/accessControl";
import { flushEditor, listEditorDrafts, markEditorSaved } from "@/lib/editorDraft";
import { useAuthStore } from "@/store/useAuthStore";
import DraftRecoveryPanel from "@/components/DraftRecoveryPanel";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let api: UseFormReturn<NoteData>;
let root: Root;
let host: HTMLDivElement;
const sample = (id: string): NoteData => ({ ...EMPTY_NOTE, id, savedAt: "2026-01-01T00:00:00Z", patientName: id, diagnosis: "saved" });
function Harness({ data }: { data: NoteData }) {
  const methods = useForm<NoteData>({ defaultValues: data });
  useEffect(() => { api = methods; methods.reset(data); }, [methods, data]);
  return <FormProvider {...methods}><DraftRecoveryPanel noteId={data.id ?? null} /><input aria-label="진단명" {...methods.register("diagnosis")} /></FormProvider>;
}
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(check()).toBe(true);
}
beforeEach(async () => {
  await seedLegacyAdmin(); useAuthStore.setState({ therapist: currentActor() });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("restores an existing record's unsaved edits after switching records and reopening", async () => {
  await act(async () => { root.render(<Harness data={sample("a")} />); });
  await act(async () => { api.setValue("diagnosis", "unsaved A"); });
  await act(async () => { await flushEditor(); });
  expect((await listEditorDrafts("master-default", "a"))[0].data.diagnosis).toBe("unsaved A");
  await act(async () => { root.render(<Harness data={sample("b")} />); });
  await act(async () => { api.setValue("diagnosis", "unsaved B"); await flushEditor(); });
  await act(async () => { root.render(<Harness data={sample("a")} />); });
  await until(() => host.textContent!.includes("초안 복구"));
  await act(async () => { [...host.querySelectorAll("button")].find(b => b.textContent === "초안 복구")!.click(); });
  expect(api.getValues("diagnosis")).toBe("unsaved A");
  expect(localStorage.getItem("pt_local_notes")).toBeNull();
  await act(async () => { await markEditorSaved(); });
  expect(await listEditorDrafts("master-default", "a")).toEqual([]);
  expect((await listEditorDrafts("master-default", "b"))[0].data.diagnosis).toBe("unsaved B");
});
it("does not silently overwrite a saved record when recovering a stale draft", async () => {
  await act(async () => { root.render(<Harness data={sample("a")} />); });
  await act(async () => { api.setValue("diagnosis", "old edit"); await flushEditor(); });
  await act(async () => { root.unmount(); }); root = createRoot(host);
  await act(async () => { root.render(<Harness data={{ ...sample("a"), savedAt: "2026-01-02T00:00:00Z" }} />); });
  await until(() => host.textContent!.includes("초안 복구"));
  await act(async () => { [...host.querySelectorAll("button")].find(b => b.textContent === "초안 복구")!.click(); });
  expect(api.getValues("savedAt")).toBe("2026-01-01T00:00:00Z");
  expect(localStorage.getItem("pt_local_notes")).toBeNull();
});
