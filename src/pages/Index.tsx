import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import RecipeCover from "@/components/RecipeCover";
import SafetyApp from "@/components/SafetyApp";
import Onboarding from "@/components/Onboarding";
import * as secureStorage from "@/lib/secureStorage";

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
          <SafetyApp key="safety" onExit={handleExit} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
