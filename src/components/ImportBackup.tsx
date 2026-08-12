import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, ArrowLeft, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import PinKeypad from "@/components/PinKeypad";
import { readBackupFile, importBackup, type BackupFile } from "@/lib/backup";
import { useTranslation } from "@/i18n";

interface ImportBackupProps {
  onSuccess: () => void;
  onBack: () => void;
}

type Stage = "pick-file" | "enter-pin";

/**
 * Restores an encrypted backup (see src/lib/backup.ts) onto this device — the offline,
 * data-free replacement for the cloud sync removed in Phase 1. Reached via a long-press
 * on the ChefHat logo, so it stays out of the way of the app's cover-story surface.
 */
const ImportBackup = ({ onSuccess, onBack }: ImportBackupProps) => {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>("pick-file");
  const [backupFile, setBackupFile] = useState<BackupFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setError(null);
    try {
      const parsed = await readBackupFile(file);
      setBackupFile(parsed);
      setFileName(file.name);
      setStage("enter-pin");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("importBackup.readError"));
    }
  };

  const handleRestore = async () => {
    if (!backupFile || pin.length < 4 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await importBackup(backupFile, pin);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("importBackup.restoreError"));
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

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

      {stage === "pick-file" ? (
        <>
          <h1 className="font-display text-xl font-bold text-foreground">{t("importBackup.pickFileTitle")}</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">
            {t("importBackup.pickFileBody")}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".safeexit,application/json"
            className="hidden"
            onChange={handleFileChosen}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="mt-8 px-8 min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <FileUp className="w-4 h-4" aria-hidden="true" />
            {t("importBackup.chooseFile")}
          </Button>
        </>
      ) : (
        <>
          <h1 className="font-display text-xl font-bold text-foreground">{t("importBackup.enterPinTitle")}</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">
            {t("importBackup.enterPinBody", { fileName })}
          </p>
          <div className="mt-8">
            <PinKeypad value={pin} onChange={setPin} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-muted-foreground mt-4 max-w-xs">
              {error}
            </p>
          )}
          <Button
            onClick={handleRestore}
            disabled={pin.length < 4 || submitting}
            className="mt-8 px-8 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("importBackup.restore")}
          </Button>
        </>
      )}

      {error && stage === "pick-file" && (
        <p role="alert" className="text-sm text-muted-foreground mt-4 max-w-xs">
          {error}
        </p>
      )}
    </motion.div>
  );
};

export default ImportBackup;
