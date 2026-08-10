import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import * as secureStorage from "@/lib/secureStorage";
import RecipeCover from "./RecipeCover";

const tapDigits = (digits: string) => {
  for (const d of digits) {
    fireEvent.pointerUp(screen.getByLabelText(`Digit ${d}`), { pointerType: "touch" });
  }
};

// The salt shaker is a small opacity-30 decoy element with no visible label — found
// by its emoji content, exactly as a user would tap it without any affordance hinting
// it's interactive. It's wired to onClick (not a custom pointer gesture), unlike the
// logo long-press below.
const tapSaltShaker = () => {
  fireEvent.click(screen.getByText("🧂"));
};

describe("RecipeCover: the hidden unlock gesture (decoy screen -> PIN -> decrypt)", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("looks like an ordinary recipe app and does nothing for 1-2 taps on the salt shaker", () => {
    render(<RecipeCover onUnlock={vi.fn()} />);

    expect(screen.getByText("Today's Favourites")).toBeInTheDocument();
    expect(screen.queryByText("Loyalty Code")).not.toBeInTheDocument();

    tapSaltShaker();
    tapSaltShaker();

    // Only two taps — the gate must not have appeared.
    expect(screen.queryByText("Choose Your Loyalty Code")).not.toBeInTheDocument();
    expect(screen.getByText("Today's Favourites")).toBeInTheDocument();
  });

  it("full flow: three taps reveal the PIN gate, and a correct PIN unlocks safety mode", async () => {
    await secureStorage.setupPin("1234");
    secureStorage.lock();
    const onUnlock = vi.fn();
    render(<RecipeCover onUnlock={onUnlock} />);

    tapSaltShaker();
    tapSaltShaker();
    tapSaltShaker();

    await screen.findByText("Loyalty Code");
    tapDigits("1234");
    fireEvent.click(screen.getByText("Redeem Code"));

    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
    expect(secureStorage.isUnlocked()).toBe(true);
  });

  it("tapping 'Back' on the PIN gate returns to the recipe list without unlocking", async () => {
    await secureStorage.setupPin("1234");
    secureStorage.lock();
    render(<RecipeCover onUnlock={vi.fn()} />);

    tapSaltShaker();
    tapSaltShaker();
    tapSaltShaker();
    await screen.findByText("Loyalty Code");

    fireEvent.click(screen.getByText("Back"));

    await screen.findByText("Today's Favourites");
    expect(secureStorage.isUnlocked()).toBe(false);
  });

  it("long-pressing the chef hat logo opens Restore a Backup, not the PIN gate", async () => {
    render(<RecipeCover onUnlock={vi.fn()} />);

    const logo = screen.getByText("Mzansi's Kitchen").parentElement!;
    fireEvent.pointerDown(logo, { pointerType: "touch" });
    // The long-press threshold is 600ms — wait past it in real time rather than fake
    // timers, which don't play well with Testing Library's own polling internals.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    expect(await screen.findByText("Restore a Backup")).toBeInTheDocument();
    expect(screen.queryByText("Choose Your Loyalty Code")).not.toBeInTheDocument();
  }, 10000);
});
