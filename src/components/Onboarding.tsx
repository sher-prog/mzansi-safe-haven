import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChefHat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PinKeypad from "@/components/PinKeypad";
import * as secureStorage from "@/lib/secureStorage";
import { isCryptoAvailable } from "@/lib/secureContext";
import CryptoUnavailableNotice from "@/components/CryptoUnavailableNotice";

interface OnboardingProps {
  onDismiss: () => void;
}

type PinStage = "choose" | "confirm";

const Onboarding = ({ onDismiss }: OnboardingProps) => {
  const [step, setStep] = useState(0);
  const [pinStage, setPinStage] = useState<PinStage>("choose");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A second tap can land before React re-renders the disabled button, and `submitting`
  // state read from the closure would still be stale at that instant — the ref is
  // updated synchronously, so it actually blocks a same-tick double-submit.
  const submittingRef = useRef(false);

  const handleGetStarted = () => {
    localStorage.setItem("safeexit_onboarded", "true");
    onDismiss();
  };

  const handlePinContinue = async () => {
    if (pin.length < 4 || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setPinError(null);
    try {
      if (pinStage === "choose") {
        setFirstPin(pin);
        setPin("");
        setPinStage("confirm");
        return;
      }
      if (pin !== firstPin) {
        setPinError("Codes don't match — let's try again.");
        setFirstPin("");
        setPin("");
        setPinStage("choose");
        return;
      }
      await secureStorage.setupPin(pin);
      handleGetStarted();
    } catch (err) {
      // setupPin goes through WebCrypto (see src/lib/crypto.ts) — if that throws
      // (e.g. crypto.subtle missing outside a secure context), surface it instead
      // of leaving the button looking like it did nothing. The isCryptoAvailable()
      // render guard below should make this unreachable in practice; this is the
      // belt-and-suspenders backstop for anything that still slips through it.
      if (import.meta.env.DEV) console.error("PIN setup failed:", err);
      toast.error("Something went wrong securing your code. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center px-8 text-center"
          >
            <div className="text-6xl mb-6">🍲</div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Welcome to Mzansi's Kitchen
            </h1>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              Your personal South African recipe companion
            </p>
            <Button onClick={() => setStep(1)} className="mt-10 px-8">
              Next
            </Button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center px-8 text-center"
          >
            <div className="text-5xl mb-6">🧂</div>
            <h2 className="font-display text-xl font-bold text-foreground">
              Your Kitchen Secret
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              On the recipe screen, tap the salt shaker 3 times to access your private kitchen journal.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-4 leading-relaxed max-w-xs">
              This instruction disappears after you tap Get Started. A small clue will always be on your recipe screen.
            </p>
            <Button onClick={() => setStep(2)} className="mt-10 px-8">
              Next
            </Button>
          </motion.div>
        )}

        {step === 2 && !isCryptoAvailable() && (
          <CryptoUnavailableNotice key="crypto-unavailable" />
        )}

        {step === 2 && isCryptoAvailable() && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center px-8 text-center"
          >
            <ChefHat className="w-10 h-10 text-primary mb-2" />
            <h2 className="font-display text-xl font-bold text-foreground">
              {pinStage === "choose" ? "Choose Your Loyalty Code" : "Confirm Your Loyalty Code"}
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed text-sm max-w-xs">
              {pinStage === "choose"
                ? "Pick a 4–6 digit code for your loyalty account."
                : "Enter it once more to confirm."}
            </p>
            {pinStage === "choose" && (
              <p className="text-xs text-muted-foreground/70 mt-3 leading-relaxed max-w-xs">
                If you forget this code, your private entries cannot be recovered.
              </p>
            )}

            <div className="mt-8">
              <PinKeypad value={pin} onChange={setPin} />
            </div>

            {pinError && <p className="text-sm text-muted-foreground mt-4 max-w-xs">{pinError}</p>}

            <Button onClick={handlePinContinue} disabled={pin.length < 4 || submitting} className="mt-8 px-8">
              {pinStage === "choose" ? "Next" : "Confirm & Get Started"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Onboarding;
