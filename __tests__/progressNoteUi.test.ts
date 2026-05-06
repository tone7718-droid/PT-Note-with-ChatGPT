import { describe, expect, it } from "vitest";
import {
  formatLastDraftSaveLabel,
  getDeleteToolbarAction,
  getPdfPageSlices,
} from "@/lib/progressNoteUi";

describe("progress note UI helpers", () => {
  it("formats the persistent auto-save status with the last saved time", () => {
    const savedAt = new Date("2026-05-06T06:25:15.000Z");

    expect(formatLastDraftSaveLabel(savedAt)).toBe("마지막 임시 저장 15:25:15");
  });

  it("keeps prompting for note deletion when selected notes exist in delete mode", () => {
    expect(getDeleteToolbarAction({ isDeleteMode: true, selectedCount: 2 })).toBe("confirm");
  });

  it("exits delete mode from the toolbar when no notes are selected", () => {
    expect(getDeleteToolbarAction({ isDeleteMode: true, selectedCount: 0 })).toBe("exit");
  });

  it("splits a tall PDF capture into enough page slices to include the full note", () => {
    const slices = getPdfPageSlices({
      canvasWidthPx: 800,
      canvasHeightPx: 2400,
      pageWidthMm: 210,
      pageHeightMm: 297,
    });

    expect(slices).toHaveLength(3);
    expect(slices[0]).toEqual({ sourceY: 0, sourceHeight: 1131, pageImageHeightMm: 297 });
    expect(slices[2].sourceY + slices[2].sourceHeight).toBe(2400);
  });
});
