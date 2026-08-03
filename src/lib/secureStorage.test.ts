import { describe, it, expect, beforeEach } from "vitest";
import * as secureStorage from "./secureStorage";

describe("secureStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("reports whether a PIN has been set up", async () => {
    expect(secureStorage.isPinSet()).toBe(false);
    await secureStorage.setupPin("1234");
    expect(secureStorage.isPinSet()).toBe(true);
  });

  it("round-trips data through setItem/getItem while unlocked", async () => {
    await secureStorage.setupPin("1234");
    await secureStorage.setItem("notes", [{ id: "1", what: "test note" }]);

    const result = await secureStorage.getItem<unknown[]>("notes");

    expect(result).toEqual([{ id: "1", what: "test note" }]);
  });

  it("never writes plaintext of sensitive values to localStorage", async () => {
    await secureStorage.setupPin("1234");
    await secureStorage.setItem("notes", [{ what: "incident details that must stay private" }]);

    const raw = localStorage.getItem("safeexit_enc_notes");

    expect(raw).not.toBeNull();
    expect(raw).not.toContain("incident details");
  });

  it("unlocks with the correct PIN and rejects an incorrect PIN", async () => {
    await secureStorage.setupPin("1234");
    secureStorage.lock();

    expect(await secureStorage.unlock("0000")).toBe(false);
    expect(secureStorage.isUnlocked()).toBe(false);

    expect(await secureStorage.unlock("1234")).toBe(true);
    expect(secureStorage.isUnlocked()).toBe(true);
  });

  it("throws instead of silently failing when reading or writing while locked", async () => {
    await expect(secureStorage.getItem("notes")).rejects.toThrow();
    await expect(secureStorage.setItem("notes", [])).rejects.toThrow();
  });

  it("migrates legacy plaintext keys to encrypted storage on first PIN setup and removes the old keys", async () => {
    localStorage.setItem("safeexit_notes", JSON.stringify([{ id: "n1", what: "legacy note" }]));
    localStorage.setItem("safeexit_vault_docs", JSON.stringify([{ id: "d1", title: "legacy doc" }]));
    localStorage.setItem("safeexit-checklist", JSON.stringify(["id", "cash"]));

    await secureStorage.setupPin("5678");

    expect(localStorage.getItem("safeexit_notes")).toBeNull();
    expect(localStorage.getItem("safeexit_vault_docs")).toBeNull();
    expect(localStorage.getItem("safeexit-checklist")).toBeNull();

    expect(await secureStorage.getItem("notes")).toEqual([{ id: "n1", what: "legacy note" }]);
    expect(await secureStorage.getItem("vault_docs")).toEqual([{ id: "d1", title: "legacy doc" }]);
    expect(await secureStorage.getItem("checklist")).toEqual(["id", "cash"]);
  });

  it("also migrates legacy data found on a later unlock, for users who set up a PIN before older plaintext data reappeared", async () => {
    await secureStorage.setupPin("1111");
    secureStorage.lock();

    localStorage.setItem("safeexit_notes", JSON.stringify([{ id: "n2", what: "post-setup legacy" }]));

    await secureStorage.unlock("1111");

    expect(localStorage.getItem("safeexit_notes")).toBeNull();
    expect(await secureStorage.getItem("notes")).toEqual([{ id: "n2", what: "post-setup legacy" }]);
  });
});
