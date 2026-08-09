/**
 * Encrypted, fully offline backup/restore — the no-server replacement for the cloud
 * sync removed in Phase 1. This is how someone survives losing or having a phone
 * destroyed: export a single encrypted file (to a USB drive, a trusted friend's
 * phone, cloud storage they control, etc.) and restore it on any other device
 * without SafeExit ever needing to talk to a server.
 *
 * The file bundles the current device's salt+verifier alongside a payload (all
 * secureStorage metadata plus every media blob) encrypted with the currently active
 * session key. Since export only happens right after the user re-confirms their PIN,
 * that active key IS the key derived from (PIN, this salt) — so the bundle is
 * self-contained and importable on a different device: re-derive the key from the
 * entered PIN + embedded salt, check it against the embedded verifier, decrypt.
 */
import { encryptJSON, decryptJSON, deriveKey, computeVerifier, base64ToBuffer, bufferToBase64 } from "./crypto";
import * as secureStorage from "./secureStorage";
import { getBlob, putBlob, listBlobKeys, clearAllBlobs } from "./blobStore";

const BACKUP_VERSION = 1;
const METADATA_KEYS = ["notes", "vault_docs", "checklist", "trusted_contact"];

interface MediaRefLike {
  originalKey: string;
  thumbKey?: string;
}
interface HasMedia {
  photo?: MediaRefLike;
  audio?: MediaRefLike;
}

interface BackupPayload {
  metadata: Record<string, unknown>;
  blobs: Record<string, { mimeType: string; base64: string }>;
}

export interface BackupFile {
  version: number;
  exportedAt: string;
  salt: string;
  verifier: string;
  /** encryptJSON(activeKey, BackupPayload) */
  payload: string;
}

export async function exportBackup(): Promise<Blob> {
  const saltAndVerifier = secureStorage.getSaltAndVerifier();
  if (!saltAndVerifier) throw new Error("No PIN set up on this device yet.");
  const activeKey = secureStorage.getActiveKey(); // throws SecureStorageLockedError if locked

  const metadata: Record<string, unknown> = {};
  for (const key of METADATA_KEYS) {
    metadata[key] = await secureStorage.getItem(key);
  }

  const blobs: Record<string, { mimeType: string; base64: string }> = {};
  for (const blobKey of await listBlobKeys()) {
    const { bytes, mimeType } = await getBlob(blobKey);
    blobs[blobKey] = { mimeType, base64: bufferToBase64(new Uint8Array(bytes)) };
  }

  const payload: BackupPayload = { metadata, blobs };
  const backup: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    salt: saltAndVerifier.salt,
    verifier: saltAndVerifier.verifier,
    payload: await encryptJSON(activeKey, payload),
  };

  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

export async function readBackupFile(file: Blob): Promise<BackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("This doesn't look like a SafeExit backup file.");
  }
  const backup = parsed as Partial<BackupFile>;
  if (backup.version !== BACKUP_VERSION || typeof backup.payload !== "string" || !backup.salt || !backup.verifier) {
    throw new Error("Unrecognised or corrupted backup file.");
  }
  return backup as BackupFile;
}

/** Re-derives the key from the entered PIN + the backup's own embedded salt, and
 * checks it against the embedded verifier — without touching this device's local PIN. */
export async function verifyBackupPin(backup: BackupFile, pin: string): Promise<CryptoKey | null> {
  const salt = base64ToBuffer(backup.salt);
  const key = await deriveKey(pin, salt);
  const candidateVerifier = await computeVerifier(key);
  return candidateVerifier === backup.verifier ? key : null;
}

function remapMedia<T extends MediaRefLike>(media: T, keyRemap: Map<string, string>): T {
  return {
    ...media,
    originalKey: keyRemap.get(media.originalKey) ?? media.originalKey,
    thumbKey: media.thumbKey ? keyRemap.get(media.thumbKey) ?? media.thumbKey : media.thumbKey,
  };
}

function remapItemsMedia<T extends HasMedia>(items: T[], keyRemap: Map<string, string>): T[] {
  return items.map((item) => ({
    ...item,
    ...(item.photo && { photo: remapMedia(item.photo, keyRemap) }),
    ...(item.audio && { audio: remapMedia(item.audio, keyRemap) }),
  }));
}

/**
 * Restores a backup onto THIS device. Verifies the PIN, then calls setupPin() to
 * establish a fresh local salt/key (this device may be brand new, or may already
 * have unrelated data) and re-encrypts everything — metadata and media blobs alike
 * — under that new local key. Existing local blobs are cleared first: import is a
 * wholesale restore, not a merge.
 */
export async function importBackup(backup: BackupFile, pin: string): Promise<void> {
  const key = await verifyBackupPin(backup, pin);
  if (!key) throw new Error("Incorrect PIN for this backup.");

  const payload = await decryptJSON<BackupPayload>(key, backup.payload);

  await secureStorage.setupPin(pin);
  await clearAllBlobs();

  const keyRemap = new Map<string, string>();
  for (const [oldKey, blob] of Object.entries(payload.blobs)) {
    const bytes = base64ToBuffer(blob.base64).buffer;
    const newKey = await putBlob(bytes, blob.mimeType);
    keyRemap.set(oldKey, newKey);
  }

  for (const [metaKey, value] of Object.entries(payload.metadata)) {
    if (value === null || value === undefined) continue;
    const toStore =
      (metaKey === "notes" || metaKey === "vault_docs") && Array.isArray(value)
        ? remapItemsMedia(value as HasMedia[], keyRemap)
        : value;
    await secureStorage.setItem(metaKey, toStore);
  }
}
