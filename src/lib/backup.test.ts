import { describe, it, expect, beforeEach } from "vitest";
import * as secureStorage from "./secureStorage";
import { putBlob, getBlob, clearAllBlobs } from "./blobStore";
import { exportBackup, importBackup, readBackupFile } from "./backup";
import { sha256Hex } from "./evidence";

interface Note {
  id: string;
  category: string;
  what: string;
  createdAt: string;
  photo?: { mimeType: string; sha256: string; capturedAt: string; gps: null; originalKey: string; thumbKey?: string };
}

describe("backup export -> import round-trip", () => {
  beforeEach(async () => {
    localStorage.clear();
    secureStorage.lock();
    // Unlike localStorage, IndexedDB isn't reset between tests by jsdom/fake-indexeddb;
    // each test below calls setupPin() with a fresh random salt, so blobs left over
    // from a previous test would be encrypted under an unrelated key. Clearing here
    // keeps tests independent (clearAllBlobs doesn't need an unlocked session).
    await clearAllBlobs();
  });

  it("restores notes, checklist, trusted contact, and media blobs byte-for-byte on a fresh key", async () => {
    await secureStorage.setupPin("1234");

    const photoBytes = new TextEncoder().encode("original evidence photo bytes").buffer;
    const originalKey = await putBlob(photoBytes, "image/jpeg");
    const thumbBytes = new TextEncoder().encode("thumbnail bytes").buffer;
    const thumbKey = await putBlob(thumbBytes, "image/jpeg");
    const expectedPhotoHash = await sha256Hex(photoBytes);

    const notes: Note[] = [
      {
        id: "n1",
        category: "Incident",
        what: "Original incident description",
        createdAt: "2026-01-05T21:00:00.000Z",
        photo: {
          mimeType: "image/jpeg",
          sha256: expectedPhotoHash,
          capturedAt: "2026-01-05T21:00:00.000Z",
          gps: null,
          originalKey,
          thumbKey,
        },
      },
    ];
    await secureStorage.setItem("notes", notes);
    await secureStorage.setItem("checklist", ["id", "cash"]);
    await secureStorage.setItem("trusted_contact", { name: "Thandi", phone: "+27821234567" });

    const backupBlob = await exportBackup();

    // Simulate returning to this (or landing on a fresh) device: lock and read the file back.
    secureStorage.lock();
    const backupFile = await readBackupFile(backupBlob);

    await importBackup(backupFile, "1234");

    // The PIN that guarded the backup now unlocks the (re-keyed) local store.
    expect(secureStorage.isUnlocked()).toBe(true);

    const restoredNotes = await secureStorage.getItem<Note[]>("notes");
    const restoredChecklist = await secureStorage.getItem<string[]>("checklist");
    const restoredContact = await secureStorage.getItem<{ name: string; phone: string }>("trusted_contact");

    expect(restoredChecklist).toEqual(["id", "cash"]);
    expect(restoredContact).toEqual({ name: "Thandi", phone: "+27821234567" });
    expect(restoredNotes).toHaveLength(1);
    expect(restoredNotes![0].what).toBe("Original incident description");
    expect(restoredNotes![0].photo!.sha256).toBe(expectedPhotoHash);

    // The media itself round-tripped: new blob keys (remapped during import), same bytes.
    const restoredOriginalKey = restoredNotes![0].photo!.originalKey;
    const restoredThumbKey = restoredNotes![0].photo!.thumbKey!;
    expect(restoredOriginalKey).not.toBe(originalKey); // re-keyed to a new blobStore id
    const restoredOriginal = await getBlob(restoredOriginalKey);
    const restoredThumb = await getBlob(restoredThumbKey);
    expect(new TextDecoder().decode(restoredOriginal.bytes)).toBe("original evidence photo bytes");
    expect(new TextDecoder().decode(restoredThumb.bytes)).toBe("thumbnail bytes");
    expect(await sha256Hex(restoredOriginal.bytes)).toBe(expectedPhotoHash);
  });

  it("rejects an incorrect PIN without altering any local data", async () => {
    await secureStorage.setupPin("1234");
    await secureStorage.setItem("checklist", ["id"]);
    const backupBlob = await exportBackup();
    const backupFile = await readBackupFile(backupBlob);

    await expect(importBackup(backupFile, "0000")).rejects.toThrow(/incorrect pin/i);
  });

  it("rejects a file that isn't a recognisable backup", async () => {
    const garbage = new Blob([JSON.stringify({ hello: "world" })], { type: "application/json" });
    await expect(readBackupFile(garbage)).rejects.toThrow();
  });
});
