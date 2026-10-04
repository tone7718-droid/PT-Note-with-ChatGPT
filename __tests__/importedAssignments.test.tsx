import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ImportedAssignments from "@/components/ImportedAssignments";
import { useAuthStore } from "@/store/useAuthStore";
import { useNoteStore } from "@/store/useNoteStore";
import { EMPTY_NOTE } from "@/types";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("requires explicit administrator selection and confirmation before assigning foreign records", async () => {
  const master = { uid: "master", id: "master", name: "관리자", role: "master" as const };
  const target = { uid: "local", id: "PT-001", name: "기존 치료사", role: "therapist" as const, resigned: false, passwordHash: "" };
  useAuthStore.setState({ therapist: master, therapists: [{ ...master, resigned: false, passwordHash: "" }, target, { ...target, uid: "foreign", id: null, name: "가져온 치료사", importUnassigned: true }] });
  const transfer = vi.fn().mockResolvedValue(undefined);
  useNoteStore.setState({ notes: [{ ...EMPTY_NOTE, id: "foreign-note", savedAt: "2026-01-01", therapistUid: "foreign" }], transferNotes: transfer });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    await act(async () => root.render(<ImportedAssignments />));
    const select = host.querySelector("select")!, button = host.querySelector("button")!;
    expect(button.disabled).toBe(true); expect(transfer).not.toHaveBeenCalled();
    await act(async () => { select.value = "local"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => button.click()); expect(transfer).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => button.click());
    expect(transfer).toHaveBeenCalledWith("foreign", "local", "기존 치료사", "PT-001");
    expect(host.textContent).toContain("기록을 배정했습니다");
  } finally { await act(async () => root.unmount()); host.remove(); confirm.mockRestore(); }
});
