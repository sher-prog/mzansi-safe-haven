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
import { useTranslation } from "@/i18n";

interface SafetyAppProps {
  onExit: () => void;
}

type Tab = "checklist" | "help" | "panic" | "notes" | "vault" | "backup";

const SafetyApp = ({ onExit }: SafetyAppProps) => {
  const { t } = useTranslation();
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
    { id: "checklist", label: t("safetyApp.tabs.checklist") },
    { id: "help", label: t("safetyApp.tabs.help") },
    { id: "panic", label: t("safetyApp.tabs.panic") },
    { id: "notes", label: t("safetyApp.tabs.notes"), icon: <span className="text-sm" aria-hidden="true">📝</span> },
    { id: "vault", label: t("safetyApp.tabs.vault"), icon: <span className="text-sm" aria-hidden="true">🔒</span> },
    { id: "backup", label: t("safetyApp.tabs.backup"), icon: <span className="text-sm" aria-hidden="true">💾</span> },
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
            <Shield className="w-6 h-6 text-primary" aria-hidden="true" />
            <span className="font-sans text-lg font-bold text-foreground">{t("safetyApp.appName")}</span>
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md bg-secondary min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            {t("safetyApp.quickExit")}
          </button>
        </div>
      </header>

      {/* Tab Navigation — flex-shrink-0 (rather than flex-1) is load-bearing: labels are
          translated and vary a lot in length (e.g. isiXhosa "Isicwangciso Sokuphuma" vs.
          English "Exit Plan"). flex-1 let short/long labels fight over equal-width slots,
          so a long label's un-wrapped text simply overflowed its box and visually spilled
          into the next tab. flex-shrink-0 lets each tab size to its own content instead,
          and the scrollable container (already overflow-x-auto) absorbs whatever doesn't
          fit on screen, rather than squeezing/overlapping tabs. max-w + truncate is a
          last-resort safety net for a single pathologically long label. */}
      <div role="tablist" aria-label={t("safetyApp.appName")} className="flex border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            className={`flex-shrink-0 min-w-[76px] max-w-[160px] px-4 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
              activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            <span className="overflow-hidden text-ellipsis">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 py-5">
        <AnimatePresence mode="wait">
          {activeTab === "checklist" && (
            <motion.div
              key="checklist"
              role="tabpanel"
              id="tabpanel-checklist"
              aria-labelledby="tab-checklist"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <ExitPlanChecklist />
            </motion.div>
          )}
          {activeTab === "help" && (
            <motion.div
              key="help"
              role="tabpanel"
              id="tabpanel-help"
              aria-labelledby="tab-help"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <GetHelp />
            </motion.div>
          )}
          {activeTab === "panic" && (
            <motion.div
              key="panic"
              role="tabpanel"
              id="tabpanel-panic"
              aria-labelledby="tab-panic"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <PanicButton />
            </motion.div>
          )}
          {activeTab === "notes" && (
            <motion.div
              key="notes"
              role="tabpanel"
              id="tabpanel-notes"
              aria-labelledby="tab-notes"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <SafetyNotes />
            </motion.div>
          )}
          {activeTab === "vault" && (
            <motion.div
              key="vault"
              role="tabpanel"
              id="tabpanel-vault"
              aria-labelledby="tab-vault"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <Vault />
            </motion.div>
          )}
          {activeTab === "backup" && (
            <motion.div
              key="backup"
              role="tabpanel"
              id="tabpanel-backup"
              aria-labelledby="tab-backup"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <BackupRestore />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default SafetyApp;
