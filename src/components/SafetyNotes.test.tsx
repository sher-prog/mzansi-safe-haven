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

// Regression coverage for "existing photos/voice notes created on desktop Chrome are no
// longer visible or playable" — confirmed root cause: MediaRecord gained mimeType and
// source fields after it first shipped, with no migration for records saved in between.
// The fields themselves turned out to be harmless when missing (nothing actually reads
// media.mimeType for display; media.source only matters for PDF export wording) — the
// bug reproduces on the one genuinely load-bearing field, originalKey, being absent
// entirely (or the record predating MediaRecord as an object at all, from the earlier
// inline-base64-string era). SafetyNotes.tsx now normalizes every note's media through
// normalizeMediaRecord() at load time; these tests exercise that end to end.
describe("SafetyNotes: old-shaped MediaRecords from before later fields/migrations existed", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("still renders a photo whose stored record predates mimeType and source", async () => {
    await secureStorage.setupPin("1234");
    const originalKey = await putBlob(new TextEncoder().encode("fake photo bytes").buffer, "image/jpeg");
    await setItem("notes", [
      {
        id: "note-1",
        category: "Incident",
        what: "Old note with a photo, saved before mimeType/source existed",
        trigger: "",
        createdAt: new Date().toISOString(),
        photo: {
          // deliberately the original Phase 2 shape: no mimeType, no source
          sha256: "deadbeef",
          capturedAt: new Date().toISOString(),
          gps: null,
          originalKey,
        },
      },
    ]);

    const { container } = render(<SafetyNotes />);
    fireEvent.click(await screen.findByText("Old note with a photo, saved before mimeType/source existed"));

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  });

  it("still plays audio whose stored record predates mimeType and source", async () => {
    await secureStorage.setupPin("1234");
    const originalKey = await putBlob(new TextEncoder().encode("fake audio bytes").buffer, "audio/mp4");
    await setItem("notes", [
      {
        id: "note-1",
        category: "Incident",
        what: "Old note with audio, saved before mimeType/source existed",
        trigger: "",
        createdAt: new Date().toISOString(),
        audio: { sha256: "deadbeef", capturedAt: new Date().toISOString(), gps: null, originalKey },
      },
    ]);

    const { container } = render(<SafetyNotes />);
    fireEvent.click(await screen.findByText("Old note with audio, saved before mimeType/source existed"));

    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
  });

  it("shows a specific 'can't be displayed' message — not nothing — for a record with no originalKey at all", async () => {
    await secureStorage.setupPin("1234");
    await setItem("notes", [
      {
        id: "note-1",
        category: "Incident",
        what: "Genuinely unrecoverable note, predates originalKey itself",
        trigger: "",
        createdAt: new Date().toISOString(),
        photo: { sha256: "deadbeef", capturedAt: new Date().toISOString(), gps: null },
      },
    ]);

    const { container } = render(<SafetyNotes />);
    fireEvent.click(await screen.findByText("Genuinely unrecoverable note, predates originalKey itself"));

    await screen.findByText(/can't be displayed/i);
    expect(container.querySelector("img")).toBeNull();
  });
});
