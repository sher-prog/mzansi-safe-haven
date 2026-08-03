import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { beginHandoff, endHandoff } from "@/lib/appFocus";
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
