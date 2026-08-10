import { describe, it, expect, beforeEach } from "vitest";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import * as secureStorage from "@/lib/secureStorage";
import ExitPlanChecklist from "./ExitPlanChecklist";

describe("ExitPlanChecklist persistence across lock/unlock", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("keeps a checked item after the app locks and is unlocked again", async () => {
    await secureStorage.setupPin("1234");

    const { unmount } = render(<ExitPlanChecklist />);
    const item = await screen.findByText("ID document / passport copy");
    fireEvent.click(item);

    // Wait for the debounced-by-effect save to hit secure storage before "locking".
    await waitFor(async () => {
      expect(await secureStorage.getItem<string[]>("checklist")).toEqual(["id"]);
    });

    // Simulate Escape: the safety-mode tree unmounts and the store locks.
    unmount();
    secureStorage.lock();
    cleanup();

    expect(await secureStorage.unlock("1234")).toBe(true);

    render(<ExitPlanChecklist />);
    const reloadedItem = await screen.findByText("ID document / passport copy");
    const button = reloadedItem.closest("button");
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("ID document / passport copy");
    // The item's label renders on the very first paint regardless of checked state — the
    // line-through class only appears once the async storage load resolves and re-renders,
    // so this has to be polled rather than asserted immediately after findByText.
    await waitFor(() => expect(reloadedItem.className).toContain("line-through"));
  });
});
