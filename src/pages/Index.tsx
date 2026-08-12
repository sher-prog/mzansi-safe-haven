import { useState, useCallback, lazy, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import RecipeCover from "@/components/RecipeCover";
import Onboarding from "@/components/Onboarding";
import * as secureStorage from "@/lib/secureStorage";

// The entire safety toolkit (notes, vault, evidence export, backup/restore, and
// everything they pull in) only needs to exist in the bundle for someone who has
// actually unlocked it — everyone else just wants a recipe app. Splitting it out
// keeps the initial download small on the low-end, data-constrained phones this is
// built for.
const SafetyApp = lazy(() => import("@/components/SafetyApp"));

// Shown for the brief moment SafetyApp's chunk is downloading. Deliberately as
// unremarkable as the recipe app itself — see ErrorBoundary.tsx's fallback for the
// same principle: nothing on screen should ever hint that something other than a
// recipe is loading, even mid-transition.
const RecipeThemedSpinner = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background">
    <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

const Index = () => {
  const [safetyMode, setSafetyMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "true") {
      localStorage.removeItem("safeexit_onboarded");
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    }
    return localStorage.getItem("safeexit_onboarded") !== "true";
  });

  const handleUnlock = useCallback(() => {
    setSafetyMode(true);
  }, []);

  const handleExit = useCallback(() => {
    secureStorage.lock();
    setSafetyMode(false);
  }, []);

  return (
    <div className={`max-w-md mx-auto min-h-screen ${safetyMode ? "safety-mode" : ""}`}>
      <AnimatePresence mode="wait">
        {showOnboarding ? (
          <Onboarding key="onboarding" onDismiss={() => setShowOnboarding(false)} />
        ) : !safetyMode ? (
          <RecipeCover key="recipe" onUnlock={handleUnlock} />
        ) : (
          <Suspense fallback={<RecipeThemedSpinner />}>
            <SafetyApp key="safety" onExit={handleExit} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
