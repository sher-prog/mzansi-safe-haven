import { Delete } from "lucide-react";

interface PinKeypadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

const PinKeypad = ({ value, onChange, maxLength = 6 }: PinKeypadProps) => {
  const press = (key: string) => {
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  };

  // Pointer events unify mouse/touch/pen into a single event stream — no separate
  // touch/mouse handlers to keep in sync, and no risk of a tap registering twice.
  // touch-action: manipulation is the load-bearing part: without it, iOS Safari's
  // native double-tap-to-zoom gesture recognizer competes with a fast burst of taps
  // on this tightly-packed grid (exactly what typing a PIN is), and can delay or
  // drop individual taps. iOS has ignored the viewport meta's user-scalable=no since
  // iOS 10, so touch-action is the only remaining way to suppress it per-element.
  const handlePointerUp = (key: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // ignore right/middle click
    press(key);
  };

  // Keyboard activation (Enter/Space on a focused button) doesn't dispatch pointer
  // events, so it's handled explicitly here rather than falling back to onClick —
  // keeps every input mode going through one explicit path per key.
  const handleKeyDown = (key: string) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    press(key);
  };

  return (
    <div className="w-full max-w-[240px] mx-auto">
      <div className="flex justify-center gap-3 mb-6" aria-hidden="true">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={`w-3 h-3 rounded-full border-2 border-primary transition-colors ${
              i < value.length ? "bg-primary" : "bg-transparent"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key === "" ? (
            <div key={`spacer-${i}`} />
          ) : (
            <button
              key={key}
              type="button"
              onPointerUp={handlePointerUp(key)}
              onKeyDown={handleKeyDown(key)}
              aria-label={key === "del" ? "Delete digit" : `Digit ${key}`}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              className="h-14 min-h-[48px] rounded-xl bg-card border border-border text-foreground text-lg font-semibold flex items-center justify-center active:bg-secondary transition-colors select-none"
            >
              {key === "del" ? <Delete className="w-5 h-5" /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
};

export default PinKeypad;
