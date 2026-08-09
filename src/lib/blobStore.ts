/**
 * Encrypted media blob storage, backed by IndexedDB instead of localStorage.
 *
 * localStorage tops out around 5MB per origin — fine for JSON metadata, far too
 * small for uncompressed original photos/audio. IndexedDB has a much larger,
 * browser-managed quota, so full-resolution originals (and their thumbnails) live
 * here instead, each encrypted with the same AES-GCM session key secureStorage
 * already manages. secureStorage's own getItem/setItem API is untouched — this is
 * purely an additional layer for binary blobs.
 */
import { encryptBytes, decryptBytes } from "./crypto";
import { getActiveKey } from "./secureStorage";

const DB_NAME = "safeexit_blobs";
const STORE_NAME = "blobs";
const DB_VERSION = 1;

interface BlobRecord {
  key: string;
  mimeType: string;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
  size: number;
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Encrypts and stores a binary blob, returning the key to fetch it back later. */
export async function putBlob(bytes: ArrayBuffer, mimeType: string): Promise<string> {
  const sessionKey = getActiveKey();
  const { iv, ciphertext } = await encryptBytes(sessionKey, bytes);
  const db = await openDB();
  const key = crypto.randomUUID();
  const record: BlobRecord = { key, mimeType, iv, ciphertext, size: bytes.byteLength };
  await runRequest(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record));
  return key;
}

/** Fetches and decrypts a blob previously stored with putBlob. */
export async function getBlob(key: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const sessionKey = getActiveKey();
  const db = await openDB();
  const record = await runRequest<BlobRecord | undefined>(
    db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key),
  );
  if (!record) throw new Error(`Blob not found: ${key}`);
  const bytes = await decryptBytes(sessionKey, record.iv, record.ciphertext);
  return { bytes, mimeType: record.mimeType };
}

export async function deleteBlob(key: string): Promise<void> {
  const db = await openDB();
  await runRequest(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key));
}

/** Every key currently stored — used by the backup exporter to bundle all media. */
export async function listBlobKeys(): Promise<string[]> {
  const db = await openDB();
  const keys = await runRequest(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAllKeys());
  return keys as string[];
}

/** Wipes all stored blobs — used when importing a backup replaces local media wholesale. */
export async function clearAllBlobs(): Promise<void> {
  const db = await openDB();
  await runRequest(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear());
}
