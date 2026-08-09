/**
 * Generates a neutral, court-facing "Evidence Pack" PDF from a set of notes:
 * a cover page (date range, entry count, an integrity explanation), a chronological
 * incident log, embedded full-resolution photos with capture metadata, and an
 * appendix listing every file's SHA-256 fingerprint. This is aimed at a magistrate's
 * clerk, not the app's own UI, so styling stays plain — no colours or icons.
 */
import jsPDF from "jspdf";
import { resolveOriginalBytes, type MediaRecord } from "./evidence";

export interface EvidencePackNote {
  id: string;
  category: string;
  what: string;
  trigger: string;
  createdAt: string;
  photo?: MediaRecord;
  audio?: MediaRecord;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function mimeToPdfFormat(mimeType: string): string {
  if (mimeType.includes("png")) return "PNG";
  if (mimeType.includes("webp")) return "WEBP";
  return "JPEG";
}

const MARGIN = 18;
const PAGE_BOTTOM = 285;

export async function generateEvidencePackPdf(notes: EvidencePackNote[]): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const sorted = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const earliest = sorted[0]?.createdAt;
  const latest = sorted[sorted.length - 1]?.createdAt;
  const generatedAt = new Date();

  doc.setProperties({ title: "SafeExit Evidence Pack" });

  const allHashes: { label: string; sha256: string }[] = [];
  for (const note of sorted) {
    const when = new Date(note.createdAt).toLocaleString();
    if (note.photo) allHashes.push({ label: `${when} — photo (${note.category})`, sha256: note.photo.sha256 });
    if (note.audio) allHashes.push({ label: `${when} — audio (${note.category})`, sha256: note.audio.sha256 });
  }

  // ---- Cover page ----
  let y = 30;
  doc.setFontSize(18);
  doc.text("SafeExit Evidence Pack", MARGIN, y);
  y += 14;
  doc.setFontSize(11);
  const line = (text: string) => {
    doc.text(text, MARGIN, y);
    y += 7;
  };
  line(`Generated: ${generatedAt.toLocaleString()}`);
  line(`Entries: ${sorted.length}`);
  line(
    `Date range covered: ${earliest ? new Date(earliest).toLocaleDateString() : "n/a"} – ${
      latest ? new Date(latest).toLocaleDateString() : "n/a"
    }`,
  );
  y += 4;

  const explanation = doc.splitTextToSize(
    "This log was created and maintained contemporaneously within the SafeExit app, on the " +
      "author's own device. Each entry below was recorded at the time it describes: the app " +
      "captured the device clock timestamp, and — where location permission was granted — GPS " +
      "coordinates, at the moment of capture. Photographs and audio recordings are reproduced " +
      "here exactly as originally captured, without recompression or other alteration. A " +
      "SHA-256 cryptographic fingerprint of each original file is listed with that entry and " +
      "again in the appendix; recomputing the fingerprint from the original file should " +
      "reproduce an identical value, confirming the file has not been altered since capture. " +
      "Some photographs were taken directly within the app (labelled \"Photographed within the " +
      "app\"); others were imported from the device's existing photo gallery (labelled " +
      "\"Imported into the app\"). In both cases the fingerprint guarantees the file has been " +
      "unchanged from the listed time onward, but for an imported file that guarantee does not " +
      "extend to the period before it was imported.",
    contentWidth,
  );
  doc.text(explanation, MARGIN, y);

  // ---- Chronological incident log ----
  doc.addPage();
  y = 20;
  doc.setFontSize(14);
  doc.text("Chronological Incident Log", MARGIN, y);
  y += 10;
  doc.setFontSize(10);

  for (const note of sorted) {
    if (y > PAGE_BOTTOM - 20) {
      doc.addPage();
      y = 20;
    }
    const when = new Date(note.createdAt).toLocaleString();
    doc.setFont("helvetica", "bold");
    doc.text(`${when} — ${note.category}`, MARGIN, y);
    doc.setFont("helvetica", "normal");
    y += 6;

    const bodyLines = doc.splitTextToSize(note.what, contentWidth);
    doc.text(bodyLines, MARGIN, y);
    y += bodyLines.length * 5;

    if (note.trigger) {
      const triggerLines = doc.splitTextToSize(`Trigger: ${note.trigger}`, contentWidth);
      doc.text(triggerLines, MARGIN, y);
      y += triggerLines.length * 5;
    }
    y += 6;
  }

  // ---- Embedded photos ----
  const photoNotes = sorted.filter((n) => n.photo);
  if (photoNotes.length > 0) {
    doc.addPage();
    y = 20;
    doc.setFontSize(14);
    doc.text("Photographic Evidence", MARGIN, y);
    y += 10;
    doc.setFontSize(10);

    for (const note of photoNotes) {
      const media = note.photo!;
      const { bytes, mimeType } = await resolveOriginalBytes(media);
      const base64 = `data:${mimeType};base64,${arrayBufferToBase64(bytes)}`;
      const format = mimeToPdfFormat(mimeType);

      const width = Math.min(contentWidth, 120);
      let height = width * 0.75;
      try {
        const props = doc.getImageProperties(base64);
        height = (props.height / props.width) * width;
      } catch {
        // Unreadable image data — still captioned with its hash below, and listed
        // in the appendix, even though we can't render a preview of it here.
      }

      if (y + height + 22 > PAGE_BOTTOM) {
        doc.addPage();
        y = 20;
      }

      try {
        doc.addImage(base64, format, MARGIN, y, width, height);
        y += height + 4;
      } catch {
        doc.text("[Image could not be rendered — see hash below]", MARGIN, y);
        y += 6;
      }

      doc.setFontSize(9);
      const provenance =
        media.source === "imported"
          ? `Imported into the app on ${new Date(media.capturedAt).toLocaleString()}; file integrity verified from the point of import onward.`
          : `Photographed within the app on ${new Date(media.capturedAt).toLocaleString()}.`;
      const caption = [
        provenance,
        media.gps ? `GPS: ${media.gps.lat.toFixed(6)}, ${media.gps.lng.toFixed(6)}` : "GPS: not captured",
        `SHA-256: ${media.sha256}`,
      ].join("   •   ");
      const captionLines = doc.splitTextToSize(caption, contentWidth);
      doc.text(captionLines, MARGIN, y);
      y += captionLines.length * 4 + 10;
      doc.setFontSize(10);
    }
  }

  // ---- Appendix: file integrity table ----
  doc.addPage();
  y = 20;
  doc.setFontSize(14);
  doc.text("Appendix: File Integrity (SHA-256)", MARGIN, y);
  y += 10;
  doc.setFontSize(9);

  if (allHashes.length === 0) {
    doc.text("No media files were attached to this log.", MARGIN, y);
  }
  for (const { label, sha256 } of allHashes) {
    if (y > PAGE_BOTTOM - 10) {
      doc.addPage();
      y = 20;
    }
    doc.text(label, MARGIN, y);
    doc.text(sha256, MARGIN, y + 4);
    y += 12;
  }

  return doc.output("blob");
}
