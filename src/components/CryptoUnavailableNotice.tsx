import { motion } from "framer-motion";
import { ChefHat, ArrowLeft } from "lucide-react";

interface CryptoUnavailableNoticeProps {
  onBack?: () => void;
}

/**
 * Shown instead of the PIN keypad when crypto.subtle isn't available (see
 * src/lib/secureContext.ts) — otherwise setupPin/unlock fail silently. Copy stays
 * in the loyalty-card cover story (see ErrorBoundary.tsx) — never mentions safety
 * features, even in an error state.
 */
const CryptoUnavailableNotice = ({ onBack }: CryptoUnavailableNoticeProps) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="relative min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center"
  >
    {onBack && (
      <button
        onClick={onBack}
        className="absolute top-4 left-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[48px] px-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
    )}

    <ChefHat className="w-8 h-8 text-primary mb-3" />
    <h1 className="font-display text-xl font-bold text-foreground">Secure Connection Needed</h1>
    <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">
      We can't set up or check your loyalty code securely on this connection.
    </p>
    <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">
      Please open the secure link — the one starting with https:// — and try again.
    </p>
  </motion.div>
);

export default CryptoUnavailableNotice;
