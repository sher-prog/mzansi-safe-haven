import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

// jsdom doesn't implement SubtleCrypto; fall back to Node's WebCrypto for tests
// that exercise src/lib/crypto.ts and src/lib/secureStorage.ts.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

// jsdom doesn't implement window.isSecureContext at all (it's `undefined`, not
// `false`) — default it to true here since the webcrypto polyfill above gives tests
// a working crypto.subtle, i.e. the condition src/lib/secureContext.ts is actually
// checking for. Individual tests can override this to false (configurable) to
// exercise the "crypto unavailable" guard/error paths deliberately.
if (typeof window !== "undefined" && window.isSecureContext === undefined) {
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
}

// jsdom@20's Blob/File don't implement arrayBuffer()/text() (added to the spec later);
// evidence.ts and backup.ts rely on them to read file bytes/JSON, so polyfill via FileReader.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
if (typeof Blob !== "undefined" && !Blob.prototype.text) {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom doesn't implement the Pointer Events spec at all (no global PointerEvent).
// PinKeypad/PanicButton/RecipeCover rely on it for unified mouse/touch/pen input,
// so polyfill a minimal version — enough to carry pointerId/pointerType/button,
// which is all this codebase reads off the event.
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
    }
  }
  // @ts-expect-error -- polyfilling a DOM global jsdom doesn't provide
  window.PointerEvent = PointerEventPolyfill;
  // @ts-expect-error -- some libraries read it off the global instead of window
  global.PointerEvent = PointerEventPolyfill;
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
