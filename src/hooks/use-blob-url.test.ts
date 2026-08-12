import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as secureStorage from "@/lib/secureStorage";
import { putBlob } from "@/lib/blobStore";
import { useBlobUrl } from "./use-blob-url";

describe("useBlobUrl (audio/photo playback path)", () => {
  beforeEach(async () => {
    localStorage.clear();
    secureStorage.lock();
    await secureStorage.setupPin("1234");
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:mock-url");
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
  });

  // vi.spyOn on a property that's already spied returns the SAME spy and keeps its
  // call history (this is how vitest 4's tinyspy behaves — vitest 3 didn't leak this
  // way), so without restoring here, test 2's spy.mock.calls[0] would silently pick up
  // test 1's leftover URL.createObjectURL call instead of its own.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the object URL's Blob with the mimeType actually stored — not a hardcoded constant", async () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");
    const key = await putBlob(new TextEncoder().encode("fake mp4 bytes").buffer, "audio/mp4");

    const { result } = renderHook(() => useBlobUrl(key));

    await waitFor(() => expect(result.current.url).toBeDefined());

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe("audio/mp4");
  });

  it("reflects whatever mimeType a different blob was stored with — proving it's not always the same value", async () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");
    const key = await putBlob(new TextEncoder().encode("fake webm bytes").buffer, "audio/webm;codecs=opus");

    const { result } = renderHook(() => useBlobUrl(key));
    await waitFor(() => expect(result.current.url).toBeDefined());

    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe("audio/webm;codecs=opus");
  });
});
