import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/store/useThemeStore";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    useThemeStore.setState({ theme: "light", resolved: "light" });
  });

  it("applies and persists dark mode", () => {
    useThemeStore.getState().setTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("pt-theme")).toBe("dark");
    expect(useThemeStore.getState().resolved).toBe("dark");
  });

  it("resolves system theme during initialization", () => {
    localStorage.setItem("pt-theme", "system");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      })),
    });

    useThemeStore.getState().init();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useThemeStore.getState()).toMatchObject({ theme: "system", resolved: "dark" });
  });
});
