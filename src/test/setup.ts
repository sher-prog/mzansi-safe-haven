import "@testing-library/jest-dom";
import { webcrypto } from "node:crypto";

// jsdom doesn't implement SubtleCrypto; fall back to Node's WebCrypto for tests
// that exercise src/lib/crypto.ts and src/lib/secureStorage.ts.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
