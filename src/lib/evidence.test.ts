import { describe, it, expect, vi, beforeEach } from "vitest";
import * as secureStorage from "./secureStorage";
import { getBlob } from "./blobStore";
import { capturePhoto, captureAudio, sha256Hex } from "./evidence";

// jsdom doesn't decode real images (canvas getContext('2d') is a stub), so the
// thumbnail step of capturePhoto can't run against a real fixture in this
// environment. Stubbing it here isolates what this test actually needs to prove:
// that the hash and the stored "original" are computed from the exact same,
// untouched bytes — never from whatever compressImage produces. (vitest hoists
// vi.mock above these imports regardless of source position.)
vi.mock("./mediaHelpers", () => ({
  compressImage: vi.fn(async () => "data:image/jpeg;base64,dGh1bWJuYWlsLWJ5dGVz"), // "thumbnail-bytes"
}));

function makeFixtureFile(content: string, name = "fixture.jpg", type = "image/jpeg"): File {
  return new File([content], name, { type });
}

describe("evidence capture: hash-before-processing", () => {
  beforeEach(async () => {
    localStorage.clear();
    secureStorage.lock();
    await secureStorage.setupPin("1234");
  });

  it("hashes, stores, and retrieves the exact original bytes — not a re-encoded copy", async () => {
    const fixtureContent = "these are the original, untouched photo bytes captured by the device";
    const file = makeFixtureFile(fixtureContent);

    const originalBytes = await file.arrayBuffer();
    const expectedHash = await sha256Hex(originalBytes);

    const media = await capturePhoto(file, "captured");

    // The hash capturePhoto reports matches an independent hash of the original file.
    expect(media.sha256).toBe(expectedHash);

    // Retrieving the stored "original" and re-hashing it reproduces the same hash —
    // proving what's stored is byte-for-byte identical to what was captured, not
    // something that passed through compressImage's lossy canvas pipeline first.
    const stored = await getBlob(media.originalKey);
    const rehash = await sha256Hex(stored.bytes);
    expect(rehash).toBe(expectedHash);
    expect(new TextDecoder().decode(stored.bytes)).toBe(fixtureContent);

    // The thumbnail is a genuinely separate artifact, and never what's hashed.
    expect(media.thumbKey).toBeDefined();
    const thumb = await getBlob(media.thumbKey!);
    expect(new TextDecoder().decode(thumb.bytes)).toBe("thumbnail-bytes");
    expect(await sha256Hex(thumb.bytes)).not.toBe(expectedHash);
  });

  it("produces a different hash for different original content (sanity check on the hash itself)", async () => {
    const fileA = makeFixtureFile("content A");
    const fileB = makeFixtureFile("content B");

    const mediaA = await capturePhoto(fileA, "captured");
    const mediaB = await capturePhoto(fileB, "captured");

    expect(mediaA.sha256).not.toBe(mediaB.sha256);
  });

  it("records a capturedAt timestamp and leaves gps null when geolocation is unavailable", async () => {
    const before = Date.now();
    const media = await capturePhoto(makeFixtureFile("timestamped content"), "captured");
    const capturedAtMs = new Date(media.capturedAt).getTime();

    expect(capturedAtMs).toBeGreaterThanOrEqual(before);
    expect(media.gps).toBeNull(); // jsdom has no navigator.geolocation by default
  });

  it("records the provenance source (captured vs imported) as given by the caller", async () => {
    const captured = await capturePhoto(makeFixtureFile("from the camera"), "captured");
    const imported = await capturePhoto(makeFixtureFile("from the gallery"), "imported");

    expect(captured.source).toBe("captured");
    expect(imported.source).toBe("imported");
  });
});

describe("evidence capture: audio mimeType fidelity (regression — Safari playback bug)", () => {
  beforeEach(async () => {
    localStorage.clear();
    secureStorage.lock();
    await secureStorage.setupPin("1234");
  });

  it("persists the recording's actual mimeType, not a hardcoded one — proven with audio/mp4 (Safari's only format)", async () => {
    // Safari's MediaRecorder only ever produces audio/mp4. The original bug hardcoded
    // "audio/webm" regardless of this, which Safari's <audio> element cannot decode
    // under any circumstances — the playback path must read back whatever was
    // actually persisted here, not reconstruct the Blob with a constant.
    const blob = new Blob(["fake mp4 audio bytes"], { type: "audio/mp4" });
    const media = await captureAudio(blob);

    expect(media.mimeType).toBe("audio/mp4");

    const stored = await getBlob(media.originalKey);
    expect(stored.mimeType).toBe("audio/mp4");
  });

  it("equally persists a webm recording correctly — proving this isn't just always defaulting to mp4", async () => {
    const blob = new Blob(["fake webm audio bytes"], { type: "audio/webm;codecs=opus" });
    const media = await captureAudio(blob);

    expect(media.mimeType).toBe("audio/webm;codecs=opus");
    const stored = await getBlob(media.originalKey);
    expect(stored.mimeType).toBe("audio/webm;codecs=opus");
  });

  it("hashes the original audio bytes untouched, same discipline as photos", async () => {
    const content = "original voice recording bytes";
    const blob = new Blob([content], { type: "audio/mp4" });
    const expectedHash = await sha256Hex(await blob.arrayBuffer());

    const media = await captureAudio(blob);
    expect(media.sha256).toBe(expectedHash);

    const stored = await getBlob(media.originalKey);
    expect(new TextDecoder().decode(stored.bytes)).toBe(content);
  });
});
