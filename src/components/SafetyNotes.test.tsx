import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, waitFor, screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import * as secureStorage from "@/lib/secureStorage";
import { setItem } from "@/lib/secureStorage";
import { putBlob } from "@/lib/blobStore";
import SafetyNotes from "./SafetyNotes";

describe("SafetyNotes: voice note playback", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("does not collapse the expanded note (and unmount the player) when the audio controls are interacted with", async () => {
    await secureStorage.setupPin("1234");

    const originalKey = await putBlob(new TextEncoder().encode("fake audio bytes").buffer, "audio/mp4");
    await setItem("notes", [
      {
        id: "note-1",
        category: "Incident",
        what: "Test note with a voice recording",
        trigger: "",
        createdAt: new Date().toISOString(),
        audio: {
          mimeType: "audio/mp4",
          source: "captured",
          sha256: "deadbeef",
          capturedAt: new Date().toISOString(),
          gps: null,
          originalKey,
        },
      },
    ]);

    const { container } = render(<SafetyNotes />);

    fireEvent.click(await screen.findByText("Test note with a voice recording"));

    const audioEl = await waitFor(() => {
      const el = container.querySelector("audio");
      expect(el).not.toBeNull();
      return el!;
    });

    // A tap on the browser's native <audio controls> UI (play/seek/volume) dispatches a
    // real click on the <audio> element, which bubbles like any other DOM click. The
    // expanded note's Card toggles collapsed/expanded on click — without a stopPropagation
    // guard around the audio player, that bubbled click collapses the card mid-playback,
    // unmounting the <audio> element with no error event ever firing. This is the
    // confirmed root cause of "voice note playback cuts off with no error shown".
    fireEvent.click(audioEl);

    expect(container.querySelector("audio")).not.toBeNull();
  });
});
