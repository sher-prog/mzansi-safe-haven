// WebCrypto-only PIN-derived encryption. No external crypto dependencies.

export const PBKDF2_ITERATIONS = 310_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export function generateSalt(length = SALT_LENGTH): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function bufferToBase64(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return buffer;
}

/** Derives an AES-GCM 256 key from a PIN + salt via PBKDF2-SHA256. */
export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/** A verifier derived from the key itself (never the PIN) — safe to store for PIN-correctness checks. */
export async function computeVerifier(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return bufferToBase64(new Uint8Array(hash));
}

/** Encrypts arbitrary JSON-serializable data with a fresh random IV; returns base64. */
export async function encryptJSON(key: CryptoKey, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bufferToBase64(combined);
}

/** Decrypts a base64 payload produced by encryptJSON. Rejects if the key is wrong or data is tampered. */
export async function decryptJSON<T>(key: CryptoKey, payload: string): Promise<T> {
  const combined = base64ToBuffer(payload);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/**
 * Encrypts a raw binary payload with a fresh random IV. Used for media blobs (photos,
 * audio) instead of encryptJSON — those go through IndexedDB, which stores ArrayBuffers
 * natively, so there's no reason to pay JSON/base64's ~33% size overhead on multi-MB files.
 */
export async function encryptBytes(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv, ciphertext };
}

/** Decrypts a payload produced by encryptBytes. Rejects if the key is wrong or data is tampered. */
export async function decryptBytes(key: CryptoKey, iv: Uint8Array, ciphertext: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}
