import { describe, it, expect, beforeEach } from "vitest";
import * as secureStorage from "./secureStorage";
import { putBlob, getBlob, deleteBlob, listBlobKeys } from "./blobStore";

describe("blobStore", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("round-trips encrypted binary data through IndexedDB", async () => {
    await secureStorage.setupPin("1234");
    const original = new TextEncoder().encode("original evidence bytes").buffer;

    const key = await putBlob(original, "application/octet-stream");
    const { bytes, mimeType } = await getBlob(key);

    expect(new TextDecoder().decode(bytes)).toBe("original evidence bytes");
    expect(mimeType).toBe("application/octet-stream");
  });

  it("throws when locked instead of silently failing", async () => {
    await secureStorage.setupPin("1234");
    const buf = new Uint8Array([1, 2, 3]).buffer;
    const key = await putBlob(buf, "application/octet-stream");
    secureStorage.lock();

    await expect(putBlob(buf, "application/octet-stream")).rejects.toThrow();
    await expect(getBlob(key)).rejects.toThrow();
  });

  it("deletes a blob and removes it from listBlobKeys", async () => {
    await secureStorage.setupPin("1234");
    const buf = new Uint8Array([9, 9, 9]).buffer;
    const key = await putBlob(buf, "application/octet-stream");

    expect(await listBlobKeys()).toContain(key);
    await deleteBlob(key);
    expect(await listBlobKeys()).not.toContain(key);
  });
});
