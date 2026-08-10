import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import { toast } from "sonner";
import * as secureStorage from "@/lib/secureStorage";
import LoyaltyGate from "./LoyaltyGate";

const tapDigits = (digits: string) => {
  for (const d of digits) {
    fireEvent.pointerUp(screen.getByLabelText(`Digit ${d}`), { pointerType: "touch" });
  }
};

describe("LoyaltyGate", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("completes PIN setup end to end (choose, confirm) when no PIN exists yet", async () => {
    const onSuccess = vi.fn();
    render(<LoyaltyGate onSuccess={onSuccess} onBack={vi.fn()} />);

    expect(screen.getByText("Choose Your Loyalty Code")).toBeInTheDocument();
    tapDigits("1234");
    fireEvent.click(screen.getByText("Continue"));

    await screen.findByText("Confirm Your Loyalty Code");
    tapDigits("1234");
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(secureStorage.isPinSet()).toBe(true);
  });

  it("unlocks with the correct PIN once one is already set", async () => {
    await secureStorage.setupPin("4321");
    secureStorage.lock();
    const onSuccess = vi.fn();
    render(<LoyaltyGate onSuccess={onSuccess} onBack={vi.fn()} />);

    expect(screen.getByText("Loyalty Code")).toBeInTheDocument();
    tapDigits("4321");
    fireEvent.click(screen.getByText("Redeem Code"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(secureStorage.isUnlocked()).toBe(true);
  });

  it("rejects an incorrect PIN (decoy rejection) — shows an error and never unlocks", async () => {
    await secureStorage.setupPin("4321");
    secureStorage.lock();
    const onSuccess = vi.fn();
    render(<LoyaltyGate onSuccess={onSuccess} onBack={vi.fn()} />);

    tapDigits("0000");
    fireEvent.click(screen.getByText("Redeem Code"));

    await screen.findByText("Code not recognised — please check your till slip.");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(secureStorage.isUnlocked()).toBe(false);

    // The PIN field is cleared after a wrong guess, and a correct retry still works —
    // a wrong code doesn't lock the user out or leave the gate in a broken state.
    tapDigits("4321");
    fireEvent.click(screen.getByText("Redeem Code"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(secureStorage.isUnlocked()).toBe(true);
  });

  describe("crypto failure on the success path (root cause of the iPhone bug)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    });

    it("shows the secure-connection notice instead of the PIN keypad when crypto.subtle is unavailable", () => {
      Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
      render(<LoyaltyGate onSuccess={vi.fn()} onBack={vi.fn()} />);

      expect(screen.getByText("Secure Connection Needed")).toBeInTheDocument();
      expect(screen.queryByText("Choose Your Loyalty Code")).not.toBeInTheDocument();
    });

    it("surfaces an error via toast and resets the submit guard, instead of going silent, when setupPin throws", async () => {
      const onSuccess = vi.fn();
      const toastErrorSpy = vi.spyOn(toast, "error");
      const importKeySpy = vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(new Error("simulated failure"));

      render(<LoyaltyGate onSuccess={onSuccess} onBack={vi.fn()} />);
      tapDigits("1234");
      fireEvent.click(screen.getByText("Continue"));
      await screen.findByText("Confirm Your Loyalty Code");
      tapDigits("1234");

      const continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);

      await waitFor(() => expect(toastErrorSpy).toHaveBeenCalled());
      expect(onSuccess).not.toHaveBeenCalled();
      expect(secureStorage.isPinSet()).toBe(false);
      expect(screen.getByText("Confirm Your Loyalty Code")).toBeInTheDocument();

      // Submit guard reset by `finally` — retrying (failure now gone) should succeed.
      importKeySpy.mockRestore();
      fireEvent.click(continueButton);

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(secureStorage.isPinSet()).toBe(true);
    });

    it("surfaces an error via toast and resets the submit guard, instead of going silent, when unlock throws", async () => {
      await secureStorage.setupPin("9999");
      secureStorage.lock();

      const onSuccess = vi.fn();
      const toastErrorSpy = vi.spyOn(toast, "error");
      const importKeySpy = vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(new Error("simulated failure"));

      render(<LoyaltyGate onSuccess={onSuccess} onBack={vi.fn()} />);
      tapDigits("9999");
      const redeemButton = screen.getByText("Redeem Code");
      fireEvent.click(redeemButton);

      await waitFor(() => expect(toastErrorSpy).toHaveBeenCalled());
      expect(onSuccess).not.toHaveBeenCalled();
      expect(secureStorage.isUnlocked()).toBe(false);

      importKeySpy.mockRestore();
      // The PIN field isn't cleared on this failure path, so the same digits retry cleanly.
      fireEvent.click(redeemButton);

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(secureStorage.isUnlocked()).toBe(true);
    });
  });
});
