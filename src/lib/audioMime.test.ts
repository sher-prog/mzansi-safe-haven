import { describe, it, expect, afterEach, vi } from "vitest";
import { pickAudioMimeType } from "./audioMime";

const originalMediaRecorder = globalThis.MediaRecorder;

function stubMediaRecorder(supported: string[]) {
  // @ts-expect-error -- test stub, not a full MediaRecorder implementation
  globalThis.MediaRecorder = {
    isTypeSupported: (type: string) => supported.includes(type),
  };
}

describe("pickAudioMimeType", () => {
  afterEach(() => {
    globalThis.MediaRecorder = originalMediaRecorder;
    vi.restoreAllMocks();
  });

  it("prefers audio/mp4 when the browser supports it (e.g. Safari) — the format both Safari and Chrome can play", () => {
    stubMediaRecorder(["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]);
    expect(pickAudioMimeType()).toBe("audio/mp4");
  });

  it("falls back to a supported webm variant when mp4 recording isn't available", () => {
    stubMediaRecorder(["audio/webm;codecs=opus", "audio/webm"]);
    expect(pickAudioMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("falls back further down the list when only a later candidate is supported", () => {
    stubMediaRecorder(["audio/ogg;codecs=opus"]);
    expect(pickAudioMimeType()).toBe("audio/ogg;codecs=opus");
  });

  it("returns undefined when nothing in the candidate list is supported", () => {
    stubMediaRecorder([]);
    expect(pickAudioMimeType()).toBeUndefined();
  });

  it("returns undefined when MediaRecorder isn't available at all", () => {
    // simulating an environment without MediaRecorder — this tsconfig has
    // strictNullChecks off, so no @ts-expect-error is needed for this assignment
    globalThis.MediaRecorder = undefined;
    expect(pickAudioMimeType()).toBeUndefined();
  });
});
