import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, ArrowLeft, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import PinKeypad from "@/components/PinKeypad";
import { readBackupFile, importBackup, type BackupFile } from "@/lib/backup";

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
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
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
      setError(err instanceof Error ? err.message : "Couldn't restore this backup.");
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
        className="absolute top-4 left-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[48px] px-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <ChefHat className="w-8 h-8 text-primary mb-3" />

      {stage === "pick-file" ? (
        <>
          <h1 className="font-display text-xl font-bold text-foreground">Restore a Backup</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">
            Choose a previously exported SafeExit backup file to restore your notes, vault,
            and photos onto this device.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".safeexit,application/json"
            className="hidden"
            onChange={handleFileChosen}
          />
          <Button onClick={() => fileInputRef.current?.click()} className="mt-8 px-8 flex items-center gap-2">
            <FileUp className="w-4 h-4" />
            Choose Backup File
          </Button>
        </>
      ) : (
        <>
          <h1 className="font-display text-xl font-bold text-foreground">Enter Backup PIN</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xs leading-relaxed">
            Enter the PIN that was set when "{fileName}" was exported. This replaces any
            data currently on this device.
          </p>
          <div className="mt-8">
            <PinKeypad value={pin} onChange={setPin} />
          </div>
          {error && <p className="text-sm text-muted-foreground mt-4 max-w-xs">{error}</p>}
          <Button onClick={handleRestore} disabled={pin.length < 4 || submitting} className="mt-8 px-8">
            Restore
          </Button>
        </>
      )}

      {error && stage === "pick-file" && (
        <p className="text-sm text-muted-foreground mt-4 max-w-xs">{error}</p>
      )}
    </motion.div>
  );
};

export default ImportBackup;
