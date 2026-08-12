import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import { toast } from "sonner";
import * as secureStorage from "@/lib/secureStorage";
import Onboarding from "./Onboarding";

const tapDigits = (digits: string) => {
  for (const d of digits) {
    fireEvent.pointerUp(screen.getByLabelText(`Digit ${d}`), { pointerType: "touch" });
  }
};

const advanceToPinStep = async () => {
  fireEvent.click(screen.getByText("Next")); // step 0 -> 1
  await screen.findByText("Your Kitchen Secret");
  fireEvent.click(screen.getByText("Next")); // step 1 -> 2 (PIN choose)
  await screen.findByText("Choose Your Loyalty Code");
};

describe("Onboarding two-step PIN setup", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("completes end to end: choose, confirm with a match, PIN is set and onDismiss fires", async () => {
    const onDismiss = vi.fn();
    render(<Onboarding onDismiss={onDismiss} />);

    await advanceToPinStep();
    expect(screen.getByText("Choose Your Loyalty Code")).toBeInTheDocument();

    tapDigits("1234");
    fireEvent.click(screen.getByText("Next"));

    expect(await screen.findByText("Confirm Your Loyalty Code")).toBeInTheDocument();

    tapDigits("1234");
    fireEvent.click(screen.getByText("Confirm & Get Started"));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(secureStorage.isPinSet()).toBe(true);
    expect(localStorage.getItem("safeexit_onboarded")).toBe("true");
  });

  it("bounces back to choose on a mismatch, and a correct retry still succeeds", async () => {
    const onDismiss = vi.fn();
    render(<Onboarding onDismiss={onDismiss} />);

    await advanceToPinStep();
    tapDigits("1234");
    fireEvent.click(screen.getByText("Next"));
    await screen.findByText("Confirm Your Loyalty Code");

    // Mismatched confirm — simulates a dropped/misrouted tap changing one digit.
    tapDigits("1235");
    fireEvent.click(screen.getByText("Confirm & Get Started"));

    expect(await screen.findByText("Codes don't match — let's try again.")).toBeInTheDocument();
    expect(screen.getByText("Choose Your Loyalty Code")).toBeInTheDocument();
    expect(secureStorage.isPinSet()).toBe(false);

    // Retry with a consistent PIN should still get all the way through.
    tapDigits("1234");
    fireEvent.click(screen.getByText("Next"));
    await screen.findByText("Confirm Your Loyalty Code");
    tapDigits("1234");
    fireEvent.click(screen.getByText("Confirm & Get Started"));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(secureStorage.isPinSet()).toBe(true);
  });

  it("also completes via keyboard-only input (Enter/Space), not just pointer taps", async () => {
    const onDismiss = vi.fn();
    render(<Onboarding onDismiss={onDismiss} />);

    await advanceToPinStep();
    for (const d of "5678") {
      fireEvent.keyDown(screen.getByLabelText(`Digit ${d}`), { key: "Enter" });
    }
    fireEvent.click(screen.getByText("Next"));
    await screen.findByText("Confirm Your Loyalty Code");

    for (const d of "5678") {
      fireEvent.keyDown(screen.getByLabelText(`Digit ${d}`), { key: " " });
    }
    fireEvent.click(screen.getByText("Confirm & Get Started"));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(secureStorage.isPinSet()).toBe(true);
  });

  it("ignores a same-tick double-tap on the final submit button (no double setupPin race)", async () => {
    const onDismiss = vi.fn();
    const setupPinSpy = vi.spyOn(secureStorage, "setupPin");
    render(<Onboarding onDismiss={onDismiss} />);

    await advanceToPinStep();
    tapDigits("1234");
    fireEvent.click(screen.getByText("Next"));
    await screen.findByText("Confirm Your Loyalty Code");
    tapDigits("1234");

    const confirmButton = screen.getByText("Confirm & Get Started");
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton); // fires before the first submit's state update commits

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(setupPinSpy).toHaveBeenCalledTimes(1);
  });

  describe("crypto failure on the success path (root cause of the iPhone bug)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      // jsdom's window persists across tests in this file — undo the manual
      // isSecureContext override so it doesn't leak into unrelated tests.
      Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    });

    it("shows the secure-connection notice instead of the PIN keypad when crypto.subtle is unavailable", async () => {
      // Simulates loading the dev server over a LAN IP on http:// (not a secure
      // context), which is how this was actually being tested on the phone.
      Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
      const onDismiss = vi.fn();
      render(<Onboarding onDismiss={onDismiss} />);

      fireEvent.click(screen.getByText("Next")); // step 0 -> 1
      await screen.findByText("Your Kitchen Secret");
      fireEvent.click(screen.getByText("Next")); // step 1 -> 2

      expect(await screen.findByText("Secure Connection Needed")).toBeInTheDocument();
      expect(screen.queryByText("Choose Your Loyalty Code")).not.toBeInTheDocument();
    });

    it("surfaces an error via toast and resets the submit guard instead of going silent, when setupPin throws", async () => {
      const onDismiss = vi.fn();
      const toastErrorSpy = vi.spyOn(toast, "error");
      // crypto.subtle IS present (isSecureContext true, per the default test polyfill)
      // so the render guard does not trigger — this exercises the try/catch/finally
      // around the actual WebCrypto call instead, for whatever unrelated reason it
      // might still throw despite the guard.
      const importKeySpy = vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(new Error("simulated failure"));

      render(<Onboarding onDismiss={onDismiss} />);
      await advanceToPinStep();
      tapDigits("1234");
      fireEvent.click(screen.getByText("Next"));
      await screen.findByText("Confirm Your Loyalty Code");
      tapDigits("1234");

      const confirmButton = screen.getByText("Confirm & Get Started");
      fireEvent.click(confirmButton);

      await waitFor(() => expect(toastErrorSpy).toHaveBeenCalled());
      expect(onDismiss).not.toHaveBeenCalled();
      expect(secureStorage.isPinSet()).toBe(false);
      // Still on the confirm screen with the PIN intact — nothing was silently lost.
      expect(screen.getByText("Confirm Your Loyalty Code")).toBeInTheDocument();

      // The submit guard must have been reset by `finally` — retrying (with the
      // underlying failure now gone) should succeed, not be permanently deadened.
      importKeySpy.mockRestore();
      fireEvent.click(confirmButton);

      await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
      expect(secureStorage.isPinSet()).toBe(true);
    });
  });
});
