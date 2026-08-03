import { describe, it, expect } from "vitest";
import { computeVerifier, decryptJSON, deriveKey, encryptJSON, generateSalt } from "./crypto";

describe("crypto", () => {
  it("round-trips JSON data through encrypt/decrypt with the correct PIN", async () => {
    const salt = generateSalt();
    const key = await deriveKey("1234", salt);
    const data = { what: "left at 2am", trigger: "argument about money", tags: ["incident", "pattern"] };

    const ciphertext = await encryptJSON(key, data);
    const result = await decryptJSON<typeof data>(key, ciphertext);

    expect(result).toEqual(data);
  });

  it("uses a random IV so identical plaintext never produces identical ciphertext", async () => {
    const salt = generateSalt();
    const key = await deriveKey("1234", salt);

    const a = await encryptJSON(key, { x: 1 });
    const b = await encryptJSON(key, { x: 1 });

    expect(a).not.toEqual(b);
  });

  it("fails to decrypt when the key was derived from the wrong PIN", async () => {
    const salt = generateSalt();
    const rightKey = await deriveKey("1234", salt);
    const wrongKey = await deriveKey("9999", salt);

    const ciphertext = await encryptJSON(rightKey, { secret: "evidence note" });

    await expect(decryptJSON(wrongKey, ciphertext)).rejects.toThrow();
  });

  it("produces a stable verifier for the same PIN+salt and a different one for a different PIN", async () => {
    const salt = generateSalt();
    const keyA1 = await deriveKey("1234", salt);
    const keyA2 = await deriveKey("1234", salt);
    const keyB = await deriveKey("4321", salt);

    expect(await computeVerifier(keyA1)).toBe(await computeVerifier(keyA2));
    expect(await computeVerifier(keyA1)).not.toBe(await computeVerifier(keyB));
  });
});
