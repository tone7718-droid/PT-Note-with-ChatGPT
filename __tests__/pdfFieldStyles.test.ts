import { describe, expect, it } from "vitest";
import { PDF_INPUT_CLASS } from "@/components/ui/Input";

describe("PDF field styles", () => {
  it("gives PDF input fields enough vertical room for captured text", () => {
    expect(PDF_INPUT_CLASS).toContain("min-h-[2.75rem]");
    expect(PDF_INPUT_CLASS).toContain("py-2");
    expect(PDF_INPUT_CLASS).toContain("leading-8");
    expect(PDF_INPUT_CLASS).toContain("overflow-visible");
  });
});
