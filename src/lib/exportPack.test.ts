import { describe, it, expect, beforeEach } from "vitest";
import * as secureStorage from "./secureStorage";
import { putBlob } from "./blobStore";
import { generateEvidencePackPdf, type EvidencePackNote } from "./exportPack";

// A real, minimal 1x1 transparent PNG — needed because the PDF generator calls
// jsPDF's getImageProperties(), which parses actual image-format headers rather
// than decoding pixels through the DOM (so it works in this jsdom test env too).
const ONE_PX_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

describe("generateEvidencePackPdf", () => {
  beforeEach(async () => {
    localStorage.clear();
    secureStorage.lock();
    await secureStorage.setupPin("1234");
  });

  it("produces a non-empty PDF containing the log text, category, and photo hash", async () => {
    const photoBytes = base64ToArrayBuffer(ONE_PX_PNG_BASE64);
    const originalKey = await putBlob(photoBytes, "image/png");
    const sha256 = "a".repeat(64); // fixture hash — doesn't need to be the real digest for this test

    const notes: EvidencePackNote[] = [
      {
        id: "1",
        category: "Incident",
        what: "He broke the kitchen door at around 9pm after an argument about money.",
        trigger: "Argument about money",
        createdAt: "2026-01-05T21:00:00.000Z",
        photo: {
          mimeType: "image/png",
          source: "captured",
          sha256,
          capturedAt: "2026-01-05T21:00:00.000Z",
          gps: { lat: -33.9249, lng: 18.4241 },
          originalKey,
          thumbKey: originalKey,
        },
      },
      {
        id: "2",
        category: "Pattern",
        what: "Second incident, no photo attached, to confirm plain text-only entries also render.",
        trigger: "",
        createdAt: "2026-01-10T08:00:00.000Z",
      },
    ];

    const blob = await generateEvidencePackPdf(notes);

    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);

    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("SafeExit Evidence Pack");
    expect(text).toContain(sha256);
    // jsPDF text ops split long strings across Tj calls, so check a short,
    // guaranteed-unbroken token from the entry rather than the full sentence.
    expect(text).toContain("Incident");
    expect(text).toContain("Pattern");
  });

  it("captions a captured photo and an imported photo differently, per provenance", async () => {
    const photoBytes = base64ToArrayBuffer(ONE_PX_PNG_BASE64);
    const capturedKey = await putBlob(photoBytes, "image/png");
    const importedKey = await putBlob(photoBytes, "image/png");

    const notes: EvidencePackNote[] = [
      {
        id: "1",
        category: "Incident",
        what: "Photographed live.",
        trigger: "",
        createdAt: "2026-01-05T21:00:00.000Z",
        photo: {
          mimeType: "image/png",
          source: "captured",
          sha256: "b".repeat(64),
          capturedAt: "2026-01-05T21:00:00.000Z",
          gps: null,
          originalKey: capturedKey,
          thumbKey: capturedKey,
        },
      },
      {
        id: "2",
        category: "Incident",
        what: "Pulled in from the gallery afterward.",
        trigger: "",
        createdAt: "2026-01-06T21:00:00.000Z",
        photo: {
          mimeType: "image/png",
          source: "imported",
          sha256: "c".repeat(64),
          capturedAt: "2026-01-06T21:00:00.000Z",
          gps: null,
          originalKey: importedKey,
          thumbKey: importedKey,
        },
      },
    ];

    const blob = await generateEvidencePackPdf(notes);
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());

    expect(text).toContain("Photographed within the app");
    expect(text).toContain("Imported into the app");
    expect(text).toContain("verified from the point of import onward");
  });

  // Regression: BackupRestore.tsx loads its own copy of `notes` independently of
  // SafetyNotes.tsx, so an old-shaped/unresolvable photo record could reach here even
  // after SafetyNotes' own display path was fixed. Before this fix, resolveOriginalBytes
  // throwing for one bad photo aborted the whole export — every other note's evidence
  // was lost along with it. This proves one unresolvable photo no longer takes down the
  // export for every other note.
  it("still exports every other note's evidence when one note's photo can't be resolved (e.g. an old, unrecoverable record)", async () => {
    const photoBytes = base64ToArrayBuffer(ONE_PX_PNG_BASE64);
    const goodKey = await putBlob(photoBytes, "image/png");

    const notes: EvidencePackNote[] = [
      {
        id: "1",
        category: "Incident",
        what: "Older note whose photo can no longer be located.",
        trigger: "",
        createdAt: "2026-01-05T21:00:00.000Z",
        photo: {
          mimeType: "",
          source: "imported",
          sha256: "",
          capturedAt: "2026-01-05T21:00:00.000Z",
          gps: null,
          originalKey: "__unrecoverable__", // no blob exists under this key
        },
      },
      {
        id: "2",
        category: "Pattern",
        what: "A second, perfectly fine note with a resolvable photo.",
        trigger: "",
        createdAt: "2026-01-10T08:00:00.000Z",
        photo: {
          mimeType: "image/png",
          source: "captured",
          sha256: "d".repeat(64),
          capturedAt: "2026-01-10T08:00:00.000Z",
          gps: null,
          originalKey: goodKey,
          thumbKey: goodKey,
        },
      },
    ];

    const blob = await generateEvidencePackPdf(notes);

    expect(blob.type).toBe("application/pdf");
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("could not be included");
    expect(text).toContain("d".repeat(64)); // the second note's photo still made it in
    expect(text).toContain("Pattern");
  });

  it("still generates a valid PDF when there are no notes at all", async () => {
    const blob = await generateEvidencePackPdf([]);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("No media files were attached to this log.");
  });
});
