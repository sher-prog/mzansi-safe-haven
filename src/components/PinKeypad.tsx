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
              onClick={() => press(key)}
              aria-label={key === "del" ? "Delete digit" : `Digit ${key}`}
              className="h-14 min-h-[48px] rounded-xl bg-card border border-border text-foreground text-lg font-semibold flex items-center justify-center active:bg-secondary transition-colors"
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
