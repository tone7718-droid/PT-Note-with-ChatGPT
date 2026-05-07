import { describe, expect, it } from "vitest";
import { SCROLLABLE_TEXTAREA_CLASS } from "@/components/ui/Textarea";

describe("textarea styles", () => {
  it("enables internal scrolling for long clinical text fields", () => {
    expect(SCROLLABLE_TEXTAREA_CLASS).toContain("overflow-y-auto");
    expect(SCROLLABLE_TEXTAREA_CLASS).toContain("overscroll-contain");
    expect(SCROLLABLE_TEXTAREA_CLASS).toContain("touch-pan-y");
    expect(SCROLLABLE_TEXTAREA_CLASS).toContain("[scrollbar-gutter:stable]");
  });
});
