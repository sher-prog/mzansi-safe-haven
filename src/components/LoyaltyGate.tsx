import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { ChefHat, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PinKeypad from "@/components/PinKeypad";
import * as secureStorage from "@/lib/secureStorage";
import { isCryptoAvailable } from "@/lib/secureContext";
import CryptoUnavailableNotice from "@/components/CryptoUnavailableNotice";
import { useTranslation } from "@/i18n";

interface LoyaltyGateProps {
  onSuccess: () => void;
  onBack: () => void;
}

type Stage = "choose" | "confirm" | "unlock";

const LoyaltyGate = ({ onSuccess, onBack }: LoyaltyGateProps) => {
  const { t } = useTranslation();
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
          setError(t("loyaltyGate.mismatch"));
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
        setError(t("loyaltyGate.notRecognised"));
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
      toast.error(t("loyaltyGate.genericError"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isCryptoAvailable()) {
    return <CryptoUnavailableNotice onBack={onBack} />;
  }

  const title =
    stage === "unlock" ? t("loyaltyGate.titleUnlock") : stage === "choose" ? t("loyaltyGate.titleChoose") : t("loyaltyGate.titleConfirm");

  const subtitle =
    stage === "unlock"
      ? t("loyaltyGate.subtitleUnlock")
      : stage === "choose"
        ? t("loyaltyGate.subtitleChoose")
        : t("loyaltyGate.subtitleConfirm");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center"
    >
      <button
        onClick={onBack}
        aria-label={t("common.back")}
        className="absolute top-4 left-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[48px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {t("common.back")}
      </button>

      <ChefHat className="w-8 h-8 text-primary mb-3" aria-hidden="true" />
      <h1 className="font-display text-xl font-bold text-foreground">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">{subtitle}</p>

      {stage === "choose" && (
        <p className="text-xs text-muted-foreground/70 mt-2 max-w-xs leading-relaxed">
          {t("loyaltyGate.forgetWarning")}
        </p>
      )}

      <div className="mt-8">
        <PinKeypad value={pin} onChange={setPin} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-muted-foreground mt-4 max-w-xs">
          {error}
        </p>
      )}

      <Button
        onClick={handleContinue}
        disabled={pin.length < 4 || submitting}
        className="mt-8 px-8 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {stage === "unlock" ? t("loyaltyGate.redeemCode") : t("loyaltyGate.continue")}
      </Button>
    </motion.div>
  );
};

export default LoyaltyGate;
