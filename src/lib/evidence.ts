/**
 * Evidence-grade media capture.
 *
 * South African protection order applications under the Domestic Violence Act are
 * affidavits backed by evidence; courts weigh originals, timestamps, and integrity.
 * The old pipeline ran every photo through a canvas before it was ever saved — that
 * re-encodes pixels and strips metadata, making the file itself contestable.
 *
 * The rule here: the ORIGINAL bytes the device captured are hashed and stored
 * unmodified. A canvas-compressed copy is generated too, but only as a lightweight
 * thumbnail for in-app display — it is never what gets hashed, exported, or treated
 * as evidence.
 */
import { compressImage } from "./mediaHelpers";
import { putBlob, getBlob, peekBlobMimeType } from "./blobStore";

export interface GpsCoords {
  lat: number;
  lng: number;
}

/** 'captured' — taken with the device camera inside the app, so capturedAt/gps reflect
 * the actual moment of the event. 'imported' — pulled in from an existing gallery file
 * (e.g. a photo taken moments earlier, before there was time to open the app); the hash
 * still guarantees the file is unchanged from the moment of import onward, but not
 * necessarily before it. */
export type MediaSource = "captured" | "imported";

export interface MediaRecord {
  mimeType: string;
  source: MediaSource;
  /** SHA-256 (hex) of the original, unmodified bytes — computed before any other
   * processing (thumbnailing, etc.) ever touches them. */
  sha256: string;
  /** ISO timestamp from the device clock at the moment of capture/import. */
  capturedAt: string;
  /** Optional — geolocation permission may be denied without blocking capture. */
  gps: GpsCoords | null;
  /** blobStore key for the full-resolution/original bytes. */
  originalKey: string;
  /** blobStore key for a compressed display copy — photos only, display use only. */
  thumbKey?: string;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Never rejects — geolocation is a nice-to-have for evidence, not a requirement. */
export function getGpsIfAvailable(timeoutMs = 8000): Promise<GpsCoords | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Captures a photo as evidence: hashes the original file's bytes untouched, stores
 * those original bytes, and separately generates+stores a compressed thumbnail for
 * in-app display only.
 *
 * `source` distinguishes a photo taken with the device camera right now ("captured")
 * from one pulled in from an existing gallery file ("imported") — a user may not have
 * time to open the app before something happens, and may need to pull in a photo taken
 * moments earlier. Both are hashed and stored the same way; only the provenance label
 * (and how it's captioned in the evidence pack) differs.
 */
export async function capturePhoto(file: File, source: MediaSource): Promise<MediaRecord> {
  const originalBytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(originalBytes); // hashed BEFORE any other processing
  const capturedAt = new Date().toISOString();
  const gps = await getGpsIfAvailable();
  const mimeType = file.type || "image/jpeg";

  const originalKey = await putBlob(originalBytes, mimeType);

  const thumbDataUrl = await compressImage(file); // display-only, never hashed/exported
  const thumbKey = await putBlob(dataUrlToArrayBuffer(thumbDataUrl), "image/jpeg");

  return { mimeType, source, sha256, capturedAt, gps, originalKey, thumbKey };
}

/** Captures a voice recording as evidence: hashes and stores the original bytes
 * untouched, using the recording's ACTUAL mimeType (see src/lib/audioMime.ts) —
 * never a hardcoded guess, since a wrong label makes an otherwise-valid recording
 * fail to play back (e.g. Safari cannot decode webm under any circumstances).
 * Always "captured" — there's no flow for importing an existing audio file. */
export async function captureAudio(blob: Blob): Promise<MediaRecord> {
  const originalBytes = await blob.arrayBuffer();
  const sha256 = await sha256Hex(originalBytes);
  const capturedAt = new Date().toISOString();
  const gps = await getGpsIfAvailable();
  const mimeType = blob.type || "audio/mp4";

  const originalKey = await putBlob(originalBytes, mimeType);

  return { mimeType, source: "captured", sha256, capturedAt, gps, originalKey };
}

/** Sentinel `originalKey` for a MediaRecord that predates the field it would need to be
 * resolved from storage at all (see normalizeMediaRecord below) — there is no blob to
 * fetch, by definition, so components must check for this before calling useBlobUrl. */
export const UNRECOVERABLE_MEDIA_KEY = "__unrecoverable__";

function isGpsCoords(value: unknown): value is GpsCoords {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).lat === "number" &&
    typeof (value as Record<string, unknown>).lng === "number"
  );
}

function unrecoverableMediaRecord(fallbackDate: string): MediaRecord {
  return {
    mimeType: "",
    source: "imported",
    sha256: "",
    capturedAt: fallbackDate,
    gps: null,
    originalKey: UNRECOVERABLE_MEDIA_KEY,
  };
}

/**
 * Normalizes a MediaRecord as read back from storage. MediaRecord has grown fields
 * over time (mimeType and source were both added after the field first shipped, storing
 * only `{ sha256, capturedAt, gps, originalKey, thumbKey? }`) with no migration written
 * for records saved in between — so a record loaded today may be missing any field added
 * after it was originally saved. This is the single place that gets backfilled, so
 * every component downstream can treat a MediaRecord's fields as always-present rather
 * than re-deriving fallbacks (or silently breaking) individually.
 *
 * `originalKey` is the one field with no reasonable default — without it there is no
 * blob to fetch. A record missing it (or not even shaped like an object — e.g. the
 * pre-MediaRecord era, when photo/audio were inline base64 strings) normalizes to the
 * UNRECOVERABLE_MEDIA_KEY sentinel instead; callers must check for that and show a
 * specific message rather than attempting to resolve it as a blob.
 */
export async function normalizeMediaRecord(raw: unknown, fallbackDate: string): Promise<MediaRecord> {
  if (typeof raw !== "object" || raw === null) {
    return unrecoverableMediaRecord(fallbackDate);
  }
  const r = raw as Record<string, unknown>;
  const originalKey = typeof r.originalKey === "string" && r.originalKey ? r.originalKey : undefined;
  if (!originalKey) {
    return unrecoverableMediaRecord(fallbackDate);
  }

  const thumbKey = typeof r.thumbKey === "string" && r.thumbKey ? r.thumbKey : undefined;
  const mimeType =
    typeof r.mimeType === "string" && r.mimeType
      ? r.mimeType
      : ((await peekBlobMimeType(originalKey)) ?? "application/octet-stream");
  const source: MediaSource = r.source === "captured" || r.source === "imported" ? r.source : "imported";
  const sha256 = typeof r.sha256 === "string" ? r.sha256 : "";
  const capturedAt = typeof r.capturedAt === "string" && r.capturedAt ? r.capturedAt : fallbackDate;
  const gps = isGpsCoords(r.gps) ? r.gps : null;

  return { mimeType, source, sha256, capturedAt, gps, originalKey, thumbKey };
}

/** Resolves a MediaRecord's display copy (thumbnail if present, else the original) to bytes. */
export async function resolveDisplayBytes(media: MediaRecord): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  return getBlob(media.thumbKey ?? media.originalKey);
}

/** Resolves a MediaRecord's full-resolution original bytes — used for evidence export. */
export async function resolveOriginalBytes(media: MediaRecord): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  return getBlob(media.originalKey);
}
