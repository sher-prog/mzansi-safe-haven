import { useEffect, useState } from "react";
import { getBlob } from "@/lib/blobStore";

export interface BlobUrlResult {
  url: string | undefined;
  /** True once resolution was attempted and definitively failed (e.g. the blob was
   * deleted from IndexedDB, or decryption failed) — distinct from `url` simply not
   * having resolved yet. Without this, a genuine failure and "still loading" both look
   * identical to a caller (`url` is undefined either way), which is how this used to
   * fail silently forever instead of surfacing anything. */
  failed: boolean;
}

/**
 * Resolves a blobStore key to a displayable object URL (e.g. for <img src> or
 * <audio src>). Revokes the URL on unmount/key-change so we don't leak memory
 * across a session with many notes/photos.
 */
export function useBlobUrl(key: string | undefined): BlobUrlResult {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!key) {
      setUrl(undefined);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    (async () => {
      try {
        const { bytes, mimeType } = await getBlob(key);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        setUrl(objectUrl);
      } catch (error) {
        if (import.meta.env.DEV) console.error(`Failed to resolve blob ${key}:`, error);
        if (!cancelled) {
          setUrl(undefined);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return { url, failed };
}
