import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";
import ExitPlanChecklist from "./ExitPlanChecklist";
import GetHelp from "./GetHelp";
import PanicButton from "./PanicButton";
import SafetyNotes from "./SafetyNotes";
import Vault from "./Vault";
import BackupRestore from "./BackupRestore";
import { isHandoffActive, endHandoff } from "@/lib/appFocus";
import { requestPersistentStorageOnce } from "@/lib/storagePersistence";

interface SafetyAppProps {
  onExit: () => void;
}

type Tab = "checklist" | "help" | "panic" | "notes" | "vault" | "backup";

const SafetyApp = ({ onExit }: SafetyAppProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("checklist");

  // Best-effort, non-blocking — see src/lib/storagePersistence.ts. Requested once per
  // device (tracked in localStorage), on first entry into safety mode.
  useEffect(() => {
    void requestPersistentStorageOnce();
  }, []);

  // Escape key and backgrounding the tab/app both act as an instant Quick Exit —
  // safety content should never be what's shown when someone glances back at the screen.
  // The one exception is an active handoff (see src/lib/appFocus.ts): actions we
  // deliberately trigger — a file picker, a mic permission prompt, an SMS/tel link —
  // also background the page, and those should not be treated as abandonment.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    const handleVisibility = () => {
      if (document.hidden) {
        if (isHandoffActive()) {
          if (import.meta.env.DEV) {
            console.log("[SafetyApp] Ignoring visibilitychange during an active handoff");
          }
          return;
        }
        onExit();
      } else {
        endHandoff();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [onExit]);

  const tabs: { id: Tab; label: string; icon?: React.ReactNode }[] = [
    { id: "checklist", label: "Exit Plan" },
    { id: "help", label: "Get Help" },
    { id: "panic", label: "Panic" },
    { id: "notes", label: "My Notes", icon: <span className="text-sm">📝</span> },
    { id: "vault", label: "Vault", icon: <span className="text-sm">🔒</span> },
    { id: "backup", label: "Backup", icon: <span className="text-sm">💾</span> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-background safety-mode"
    >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="font-sans text-lg font-bold text-foreground">SafeExit</span>
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md bg-secondary"
          >
            <ArrowLeft className="w-4 h-4" />
            Quick Exit
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[76px] py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === tab.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 py-5">
        <AnimatePresence mode="wait">
          {activeTab === "checklist" && (
            <motion.div key="checklist" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <ExitPlanChecklist />
            </motion.div>
          )}
          {activeTab === "help" && (
            <motion.div key="help" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <GetHelp />
            </motion.div>
          )}
          {activeTab === "panic" && (
            <motion.div key="panic" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <PanicButton />
            </motion.div>
          )}
          {activeTab === "notes" && (
            <motion.div key="notes" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <SafetyNotes />
            </motion.div>
          )}
          {activeTab === "vault" && (
            <motion.div key="vault" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <Vault />
            </motion.div>
          )}
          {activeTab === "backup" && (
            <motion.div key="backup" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <BackupRestore />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default SafetyApp;
