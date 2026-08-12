import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChefHat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PinKeypad from "@/components/PinKeypad";
import * as secureStorage from "@/lib/secureStorage";
import { isCryptoAvailable } from "@/lib/secureContext";
import CryptoUnavailableNotice from "@/components/CryptoUnavailableNotice";
import { useTranslation } from "@/i18n";

interface OnboardingProps {
  onDismiss: () => void;
}

type PinStage = "choose" | "confirm";

const Onboarding = ({ onDismiss }: OnboardingProps) => {
  const { t } = useTranslation();
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
        setPinError(t("onboarding.pin.mismatch"));
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
      toast.error(t("onboarding.pin.genericError"));
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
            <div className="text-6xl mb-6" aria-hidden="true">🍲</div>
            <h1 className="font-display text-2xl font-bold text-foreground">{t("onboarding.step0.title")}</h1>
            <p className="text-muted-foreground mt-3 leading-relaxed">{t("onboarding.step0.subtitle")}</p>
            <Button
              onClick={() => setStep(1)}
              className="mt-10 px-8 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("onboarding.step0.next")}
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
            <div className="text-5xl mb-6" aria-hidden="true">🧂</div>
            <h2 className="font-display text-xl font-bold text-foreground">{t("onboarding.step1.title")}</h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">{t("onboarding.step1.body")}</p>
            <p className="text-xs text-muted-foreground/70 mt-4 leading-relaxed max-w-xs">{t("onboarding.step1.note")}</p>
            <Button
              onClick={() => setStep(2)}
              className="mt-10 px-8 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("onboarding.step1.next")}
            </Button>
          </motion.div>
        )}

        {step === 2 && !isCryptoAvailable() && <CryptoUnavailableNotice key="crypto-unavailable" />}

        {step === 2 && isCryptoAvailable() && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center px-8 text-center"
          >
            <ChefHat className="w-10 h-10 text-primary mb-2" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold text-foreground">
              {pinStage === "choose" ? t("onboarding.pin.chooseTitle") : t("onboarding.pin.confirmTitle")}
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed text-sm max-w-xs">
              {pinStage === "choose" ? t("onboarding.pin.choosePrompt") : t("onboarding.pin.confirmPrompt")}
            </p>
            {pinStage === "choose" && (
              <p className="text-xs text-muted-foreground/70 mt-3 leading-relaxed max-w-xs">
                {t("onboarding.pin.forgetWarning")}
              </p>
            )}

            <div className="mt-8">
              <PinKeypad value={pin} onChange={setPin} />
            </div>

            {pinError && (
              <p role="alert" className="text-sm text-muted-foreground mt-4 max-w-xs">
                {pinError}
              </p>
            )}

            <Button
              onClick={handlePinContinue}
              disabled={pin.length < 4 || submitting}
              className="mt-8 px-8 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {pinStage === "choose" ? t("onboarding.pin.next") : t("onboarding.pin.confirmAndStart")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Onboarding;
