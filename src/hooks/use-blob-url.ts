import { useEffect, useState } from "react";
import { getBlob } from "@/lib/blobStore";

/**
 * Resolves a blobStore key to a displayable object URL (e.g. for <img src> or
 * <audio src>). Revokes the URL on unmount/key-change so we don't leak memory
 * across a session with many notes/photos.
 */
export function useBlobUrl(key: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
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
        if (!cancelled) setUrl(undefined);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return url;
}
