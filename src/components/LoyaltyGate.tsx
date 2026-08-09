import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { ChefHat, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PinKeypad from "@/components/PinKeypad";
import * as secureStorage from "@/lib/secureStorage";
import { isCryptoAvailable } from "@/lib/secureContext";
import CryptoUnavailableNotice from "@/components/CryptoUnavailableNotice";

interface LoyaltyGateProps {
  onSuccess: () => void;
  onBack: () => void;
}

type Stage = "choose" | "confirm" | "unlock";

const LoyaltyGate = ({ onSuccess, onBack }: LoyaltyGateProps) => {
  const [stage, setStage] = useState<Stage>(() => (secureStorage.isPinSet() ? "unlock" : "choose"));
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A second tap can land before React re-renders the disabled button, and `submitting`
  // state read from the closure would still be stale at that instant — the ref is
  // updated synchronously, so it actually blocks a same-tick double-submit.
  const submittingRef = useRef(false);

  const handleContinue = async () => {
    if (pin.length < 4 || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (stage === "choose") {
        setFirstPin(pin);
        setPin("");
        setStage("confirm");
        return;
      }
      if (stage === "confirm") {
        if (pin !== firstPin) {
          setError("Codes don't match — let's try again.");
          setFirstPin("");
          setPin("");
          setStage("choose");
          return;
        }
        await secureStorage.setupPin(pin);
        onSuccess();
        return;
      }
      const ok = await secureStorage.unlock(pin);
      if (ok) {
        onSuccess();
      } else {
        setError("Code not recognised — please check your till slip.");
        setPin("");
      }
    } catch (err) {
      // setupPin/unlock both go through WebCrypto (see src/lib/crypto.ts) — if that
      // throws (e.g. crypto.subtle missing outside a secure context), surface it
      // instead of leaving the button looking like it did nothing. The
      // isCryptoAvailable() render guard should make this unreachable in practice;
      // this is the belt-and-suspenders backstop for anything that still slips
      // through it (e.g. the context becoming unavailable mid-session).
      if (import.meta.env.DEV) console.error("PIN operation failed:", err);
      toast.error("Something went wrong securing your code. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isCryptoAvailable()) {
    return <CryptoUnavailableNotice onBack={onBack} />;
  }

  const title =
    stage === "unlock" ? "Loyalty Code" : stage === "choose" ? "Choose Your Loyalty Code" : "Confirm Your Loyalty Code";

  const subtitle =
    stage === "unlock"
      ? "Enter your loyalty code to view your saved rewards."
      : stage === "choose"
        ? "Pick a 4–6 digit code for your loyalty account."
        : "Enter it once more to confirm.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center"
    >
      <button
        onClick={onBack}
        className="absolute top-4 left-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[48px] px-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <ChefHat className="w-8 h-8 text-primary mb-3" />
      <h1 className="font-display text-xl font-bold text-foreground">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">{subtitle}</p>

      {stage === "choose" && (
        <p className="text-xs text-muted-foreground/70 mt-2 max-w-xs leading-relaxed">
          If you forget this code, your private entries cannot be recovered.
        </p>
      )}

      <div className="mt-8">
        <PinKeypad value={pin} onChange={setPin} />
      </div>

      {error && <p className="text-sm text-muted-foreground mt-4 max-w-xs">{error}</p>}

      <Button onClick={handleContinue} disabled={pin.length < 4 || submitting} className="mt-8 px-8">
        {stage === "unlock" ? "Redeem Code" : "Continue"}
      </Button>
    </motion.div>
  );
};

export default LoyaltyGate;
