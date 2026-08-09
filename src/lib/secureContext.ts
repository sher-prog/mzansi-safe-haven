/**
 * crypto.subtle only exists in secure contexts (HTTPS, or literal localhost/127.0.0.1)
 * — not on an arbitrary LAN IP served over plain HTTP, which is how this app gets
 * tested on a phone during development. When it's missing, every PIN operation
 * (setupPin/unlock, both built on deriveKey in src/lib/crypto.ts) throws inside an
 * async call with no visible feedback: the mismatch-PIN path is plain string
 * comparison and works fine, so this failure is easy to mistake for something else.
 * Production is HTTPS, so this is primarily a dev-testing footgun — but a silent
 * crypto failure must never be possible, hence this explicit, checkable guard.
 */
export function isCryptoAvailable(): boolean {
  return typeof window !== "undefined" && !!window.isSecureContext && !!window.crypto?.subtle;
}
