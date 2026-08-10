import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import PinKeypad from "./PinKeypad";

describe("PinKeypad", () => {
  it("registers a digit on pointerUp (unified mouse/touch/pen path)", () => {
    const onChange = vi.fn();
    render(<PinKeypad value="" onChange={onChange} />);
    fireEvent.pointerUp(screen.getByLabelText("Digit 5"), { pointerType: "touch" });
    expect(onChange).toHaveBeenCalledWith("5");
  });

  it("registers a digit via keyboard Enter and Space, for users who can't use touch/pointer", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PinKeypad value="" onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText("Digit 3"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("3");

    onChange.mockClear();
    rerender(<PinKeypad value="3" onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText("Digit 7"), { key: " " });
    expect(onChange).toHaveBeenCalledWith("37");
  });

  it("ignores a non-primary mouse button (e.g. right-click)", () => {
    const onChange = vi.fn();
    render(<PinKeypad value="" onChange={onChange} />);
    fireEvent.pointerUp(screen.getByLabelText("Digit 1"), { pointerType: "mouse", button: 2 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("deletes the last digit", () => {
    const onChange = vi.fn();
    render(<PinKeypad value="12" onChange={onChange} />);
    fireEvent.pointerUp(screen.getByLabelText("Delete digit"), { pointerType: "touch" });
    expect(onChange).toHaveBeenCalledWith("1");
  });

  it("does not grow past maxLength", () => {
    const onChange = vi.fn();
    render(<PinKeypad value="123456" onChange={onChange} maxLength={6} />);
    fireEvent.pointerUp(screen.getByLabelText("Digit 9"), { pointerType: "touch" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sets touch-action: manipulation on every key so iOS Safari's double-tap-to-zoom gesture can't intercept rapid taps", () => {
    // jsdom's CSSOM doesn't recognise touch-action as a known property (it never
    // makes it into cssText/the style attribute, so jest-dom's toHaveStyle can't see
    // it here) — reading the style property accessor directly still reflects it,
    // and this is exactly how a real browser's inline style would carry it too.
    render(<PinKeypad value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Digit 1").style.touchAction).toBe("manipulation");
    expect(screen.getByLabelText("Delete digit").style.touchAction).toBe("manipulation");
  });
});
