/**
 * Asks the browser not to silently evict this origin's storage under pressure
 * (navigator.storage.persist()). Support and the actual grant are both
 * inconsistent across mobile browsers — this is best-effort and must never
 * block normal usage; the Backup & Restore section surfaces a gentle notice
 * when it isn't granted, encouraging regular backups instead.
 */
const REQUESTED_KEY = "safeexit_storage_persist_requested";

/** Call once, e.g. on first entry into safety mode. Fire-and-forget by design. */
export async function requestPersistentStorageOnce(): Promise<void> {
  if (localStorage.getItem(REQUESTED_KEY)) return;
  localStorage.setItem(REQUESTED_KEY, "1");
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Best-effort — an unsupported or denied request is not an error condition.
  }
}

/** Read-only check (no prompt) — null means the API isn't available on this browser. */
export async function isStoragePersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
