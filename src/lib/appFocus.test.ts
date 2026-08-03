import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { beginHandoff, endHandoff, isHandoffActive } from "./appFocus";

describe("appFocus handoff flag", () => {
  beforeEach(() => {
    endHandoff();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is inactive with no handoff in progress", () => {
    expect(isHandoffActive()).toBe(false);
  });

  it("is active immediately after beginHandoff()", () => {
    beginHandoff();
    expect(isHandoffActive()).toBe(true);
  });

  it("clears once endHandoff() is called", () => {
    beginHandoff();
    endHandoff();
    expect(isHandoffActive()).toBe(false);
  });

  it("expires on its own after the 3 minute backstop even if never explicitly ended", () => {
    vi.useFakeTimers();
    beginHandoff();
    expect(isHandoffActive()).toBe(true);

    vi.advanceTimersByTime(3 * 60 * 1000 - 1);
    expect(isHandoffActive()).toBe(true);

    vi.advanceTimersByTime(2);
    expect(isHandoffActive()).toBe(false);
  });
});
