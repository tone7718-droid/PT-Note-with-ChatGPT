export type DeleteToolbarAction = "enter" | "exit" | "confirm";

export function formatLastDraftSaveLabel(savedAt: Date): string {
  const time = savedAt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `마지막 임시 저장 ${time}`;
}

export function getDeleteToolbarAction({
  isDeleteMode,
  selectedCount,
}: {
  isDeleteMode: boolean;
  selectedCount: number;
}): DeleteToolbarAction {
  if (!isDeleteMode) return "enter";
  return selectedCount > 0 ? "confirm" : "exit";
}

export function getPdfPageSlices({
  canvasWidthPx,
  canvasHeightPx,
  pageWidthMm,
  pageHeightMm,
}: {
  canvasWidthPx: number;
  canvasHeightPx: number;
  pageWidthMm: number;
  pageHeightMm: number;
}): Array<{ sourceY: number; sourceHeight: number; pageImageHeightMm: number }> {
  if (canvasWidthPx <= 0 || canvasHeightPx <= 0) return [];

  const pageHeightPx = Math.max(1, Math.floor((pageHeightMm * canvasWidthPx) / pageWidthMm));
  const slices: Array<{ sourceY: number; sourceHeight: number; pageImageHeightMm: number }> = [];

  for (let sourceY = 0; sourceY < canvasHeightPx; sourceY += pageHeightPx) {
    const sourceHeight = Math.min(pageHeightPx, canvasHeightPx - sourceY);
    const isFullPage = sourceHeight === pageHeightPx;
    slices.push({
      sourceY,
      sourceHeight,
      pageImageHeightMm: isFullPage
        ? pageHeightMm
        : Number(((sourceHeight * pageWidthMm) / canvasWidthPx).toFixed(2)),
    });
  }

  return slices;
}
