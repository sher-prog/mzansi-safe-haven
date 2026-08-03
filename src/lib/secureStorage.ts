import {
  base64ToBuffer,
  bufferToBase64,
  computeVerifier,
  decryptJSON,
  deriveKey,
  encryptJSON,
  generateSalt,
} from "./crypto";

const SALT_KEY = "safeexit_enc_salt";
const VERIFIER_KEY = "safeexit_enc_verifier";
const DATA_PREFIX = "safeexit_enc_";

/** Maps a secureStorage suffix to the plaintext key it replaces from pre-PIN app versions. */
const LEGACY_KEYS: Record<string, string> = {
  notes: "safeexit_notes",
  vault_docs: "safeexit_vault_docs",
  checklist: "safeexit-checklist",
};

// The derived key lives only in memory for the lifetime of an unlocked session.
let activeKey: CryptoKey | null = null;

/** Thrown by getItem/setItem when called without an unlocked session, so callers can
 * distinguish "needs a PIN re-entry" from other failures (e.g. storage quota). */
export class SecureStorageLockedError extends Error {
  constructor() {
    super("Secure storage is locked");
    this.name = "SecureStorageLockedError";
  }
}

export function isPinSet(): boolean {
  return localStorage.getItem(SALT_KEY) !== null && localStorage.getItem(VERIFIER_KEY) !== null;
}

export function isUnlocked(): boolean {
  return activeKey !== null;
}

export function lock(): void {
  activeKey = null;
}

async function migrateLegacyData(): Promise<void> {
  if (!activeKey) return;
  for (const [suffix, legacyKey] of Object.entries(LEGACY_KEYS)) {
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw);
      await setItem(suffix, parsed);
      localStorage.removeItem(legacyKey);
    } catch {
      if (import.meta.env.DEV) console.error(`Failed to migrate legacy storage key: ${suffix}`);
    }
  }
}

export async function setupPin(pin: string): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey(pin, salt);
  const verifier = await computeVerifier(key);
  localStorage.setItem(SALT_KEY, bufferToBase64(salt));
  localStorage.setItem(VERIFIER_KEY, verifier);
  activeKey = key;
  await migrateLegacyData();
}

export async function unlock(pin: string): Promise<boolean> {
  const saltB64 = localStorage.getItem(SALT_KEY);
  const storedVerifier = localStorage.getItem(VERIFIER_KEY);
  if (!saltB64 || !storedVerifier) return false;

  const salt = base64ToBuffer(saltB64);
  const key = await deriveKey(pin, salt);
  const candidateVerifier = await computeVerifier(key);

  if (candidateVerifier !== storedVerifier) return false;

  activeKey = key;
  await migrateLegacyData();
  return true;
}

export async function getItem<T>(suffix: string): Promise<T | null> {
  if (!activeKey) throw new SecureStorageLockedError();
  const raw = localStorage.getItem(DATA_PREFIX + suffix);
  if (raw === null) return null;
  try {
    return await decryptJSON<T>(activeKey, raw);
  } catch {
    if (import.meta.env.DEV) console.error(`Failed to decrypt secure storage key: ${suffix}`);
    return null;
  }
}

export async function setItem<T>(suffix: string, value: T): Promise<void> {
  if (!activeKey) throw new SecureStorageLockedError();
  const encrypted = await encryptJSON(activeKey, value);
  localStorage.setItem(DATA_PREFIX + suffix, encrypted);
}

export function removeItem(suffix: string): void {
  localStorage.removeItem(DATA_PREFIX + suffix);
}
