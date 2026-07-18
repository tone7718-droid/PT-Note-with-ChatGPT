import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { todayLocalISO } from "@/lib/localDate";

describe("todayLocalISO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("로컬 자정 직후에도 로컬 기준 날짜를 반환한다 (UTC 밀림 방지)", () => {
    // 로컬 시각 2026-07-18 00:30 — UTC 기준(toISOString)이라면 양의 오프셋
    // 타임존(KST 등)에서 전날(07-17)로 밀리는 시각
    vi.setSystemTime(new Date(2026, 6, 18, 0, 30, 0));
    expect(todayLocalISO()).toBe("2026-07-18");
  });

  it("한 자리 월/일을 0 패딩한다", () => {
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0));
    expect(todayLocalISO()).toBe("2026-01-05");
  });
});
