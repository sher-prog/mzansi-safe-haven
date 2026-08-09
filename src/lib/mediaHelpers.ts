/**
 * Compress an image file to max width, returns base64 string.
 */
export const compressImage = (file: File, maxWidth = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export type StorageLevel = "ok" | "warning" | "critical";

export interface StorageStatus {
  usageBytes: number;
  /** null when the Storage API isn't available (older browsers/some test runners) —
   * in that case we can only see localStorage's own tiny ceiling, which understates
   * real capacity now that media blobs live in IndexedDB, so we don't warn off it. */
  quotaBytes: number | null;
  level: StorageLevel;
  message: string | null;
}

const WARNING_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;

function estimateLocalStorageBytes(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) total += (localStorage.getItem(key) || "").length * 2; // UTF-16
  }
  return total;
}

/**
 * Reports how full the device's storage is, using the Storage API's origin-wide
 * estimate (covers both localStorage metadata and the IndexedDB blob store) rather
 * than the old ~5MB localStorage-only ceiling — full-resolution evidence media is
 * now MBs per item, so that ceiling was never the right number to warn against.
 */
export async function checkStorageUsage(): Promise<StorageStatus> {
  if (!navigator.storage?.estimate) {
    return { usageBytes: estimateLocalStorageBytes(), quotaBytes: null, level: "ok", message: null };
  }

  try {
    const { usage, quota } = await navigator.storage.estimate();
    const usageBytes = usage ?? 0;
    const quotaBytes = quota ?? null;
    const ratio = quotaBytes ? usageBytes / quotaBytes : 0;

    if (quotaBytes && ratio >= CRITICAL_RATIO) {
      return {
        usageBytes,
        quotaBytes,
        level: "critical",
        message: "Device storage is almost full. Export a backup and delete older entries before adding more.",
      };
    }
    if (quotaBytes && ratio >= WARNING_RATIO) {
      return {
        usageBytes,
        quotaBytes,
        level: "warning",
        message: "Storage is filling up. Consider exporting a backup and removing older entries.",
      };
    }
    return { usageBytes, quotaBytes, level: "ok", message: null };
  } catch {
    return { usageBytes: estimateLocalStorageBytes(), quotaBytes: null, level: "ok", message: null };
  }
}
