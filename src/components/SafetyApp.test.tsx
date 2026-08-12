import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import { beginHandoff, endHandoff } from "@/lib/appFocus";
import type { Language } from "@/i18n";
import en from "@/i18n/locales/en";
import zu from "@/i18n/locales/zu";
import xh from "@/i18n/locales/xh";
import af from "@/i18n/locales/af";
import SafetyApp from "./SafetyApp";

const setHidden = (hidden: boolean) => {
  act(() => {
    Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

describe("SafetyApp visibility handling", () => {
  beforeEach(() => {
    endHandoff();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("exits (locks) on backgrounding with no handoff in progress — original Escape/backgrounding behavior", async () => {
    const onExit = vi.fn();
    render(<SafetyApp onExit={onExit} />);
    await act(async () => {});

    setHidden(true);

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("does NOT exit when the page backgrounds during an active handoff (e.g. opening the photo picker)", async () => {
    const onExit = vi.fn();
    render(<SafetyApp onExit={onExit} />);
    await act(async () => {});

    // This is what SafetyNotes/Vault call right before fileInputRef.current.click(),
    // and what PanicButton calls before opening the sms:/tel: link.
    beginHandoff();
    setHidden(true);

    expect(onExit).not.toHaveBeenCalled();
  });

  it("clears the handoff once the page becomes visible again, so a later background still exits", async () => {
    const onExit = vi.fn();
    render(<SafetyApp onExit={onExit} />);
    await act(async () => {});

    beginHandoff();
    setHidden(true);
    expect(onExit).not.toHaveBeenCalled();

    setHidden(false); // user returns from the file picker
    setHidden(true); // a genuinely new backgrounding, unrelated to any handoff

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("still exits instantly on Escape regardless of any active handoff", async () => {
    const onExit = vi.fn();
    render(<SafetyApp onExit={onExit} />);
    await act(async () => {});

    beginHandoff();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

// isiZulu/isiXhosa tab labels run 2-3x longer than their English source ("Exit Plan" ->
// "Isicwangciso Sokuphuma"). jsdom doesn't run a real layout engine, so pixel-level
// overlap can't be asserted here — this instead locks in the CSS contract that prevents
// it: every tab sizes to its own content (flex-shrink-0, not flex-1, so long/short labels
// don't fight over equal-width slots) inside a horizontally scrollable strip
// (overflow-x-auto), for every supported locale's actual label set.
describe("SafetyApp tab bar: layout is robust to variable-length translated labels", () => {
  const locales: { code: Language; dict: typeof en }[] = [
    { code: "en", dict: en },
    { code: "zu", dict: zu },
    { code: "xh", dict: xh },
    { code: "af", dict: af },
  ];

  beforeEach(() => {
    endHandoff();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it.each(locales)("renders every tab, untruncated in the DOM text, for locale '$code'", async ({ code, dict }) => {
    localStorage.setItem("safeexit_lang", code);
    render(<SafetyApp onExit={vi.fn()} />);
    await act(async () => {});

    const tablist = screen.getByRole("tablist");
    expect(tablist.className).toContain("overflow-x-auto");

    for (const label of Object.values(dict.safetyApp.tabs)) {
      const tab = screen.getByRole("tab", { name: label });
      // flex-shrink-0 (not flex-1) is what lets this tab claim its own natural width
      // instead of being squeezed to an equal share of the bar.
      expect(tab.className).toContain("flex-shrink-0");
      expect(tab.className).not.toContain("flex-1");
    }

    localStorage.removeItem("safeexit_lang");
  });
});
