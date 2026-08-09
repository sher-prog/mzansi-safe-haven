import { useState, useEffect } from "react";
import { Save, ShieldCheck, FileDown, ChefHat, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getItem } from "@/lib/secureStorage";
import { generateEvidencePackPdf, type EvidencePackNote } from "@/lib/exportPack";
import { exportBackup } from "@/lib/backup";
import { downloadBlob } from "@/lib/download";
import { isStoragePersisted } from "@/lib/storagePersistence";
import LoyaltyGate from "@/components/LoyaltyGate";
import { toast } from "sonner";

interface Note {
  id: string;
  category: string;
  what: string;
  trigger: string;
  createdAt: string;
  photo?: EvidencePackNote["photo"];
  audio?: EvidencePackNote["audio"];
}

/**
 * Single, obvious home for "get my data off this phone" — the offline, data-free
 * replacement for the cloud sync removed in Phase 1. Written in plain, numbered
 * steps: this is read under stress, possibly by someone with limited data/literacy,
 * not skimmed by someone comfortable with technical UI.
 */
const BackupRestore = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [exportGate, setExportGate] = useState<"evidence" | "backup" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getItem<Note[]>("notes");
        if (stored) setNotes(stored);
      } catch (error) {
        if (import.meta.env.DEV) console.error("Failed to load notes for export:", error);
      }
    })();
    isStoragePersisted().then(setPersisted);
  }, []);

  const runExportEvidencePack = async () => {
    setExporting(true);
    try {
      const packNotes: EvidencePackNote[] = notes.map((n) => ({
        id: n.id,
        category: n.category,
        what: n.what,
        trigger: n.trigger,
        createdAt: n.createdAt,
        photo: n.photo,
        audio: n.audio,
      }));
      const blob = await generateEvidencePackPdf(packNotes);
      downloadBlob(blob, `safeexit-evidence-pack-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Evidence pack downloaded.");
    } catch (error) {
      if (import.meta.env.DEV) console.error("Failed to generate evidence pack:", error);
      toast.error("Failed to generate evidence pack.");
    } finally {
      setExporting(false);
    }
  };

  const runExportBackup = async () => {
    setExporting(true);
    try {
      const blob = await exportBackup();
      downloadBlob(blob, `safeexit-backup-${new Date().toISOString().slice(0, 10)}.safeexit`);
      toast.success("Encrypted backup downloaded. Keep it somewhere safe, off this device.");
    } catch (error) {
      if (import.meta.env.DEV) console.error("Failed to export backup:", error);
      toast.error("Failed to export backup.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Save className="w-5 h-5 text-primary" />
          Backup & Restore
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Everything in SafeExit is saved only on this phone. Back it up so you don't lose it.
        </p>
      </div>

      {persisted === false && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            This phone may clear app storage automatically if it runs low on space. It's a good
            idea to make a backup regularly, just in case.
          </p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Why this matters</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your notes, photos, recordings and vault only exist on this phone. If this phone is
          lost, taken, or broken, that information is gone — unless you have a backup saved
          somewhere else.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">How to back up</h3>
        <ol className="space-y-2 text-sm text-muted-foreground leading-relaxed list-decimal list-inside">
          <li>Tap "Export Encrypted Backup" below.</li>
          <li>
            Save the file somewhere safe — for example: email it to yourself using an email
            account they don't know about, save it to Google Drive, or send it to someone you
            trust.
          </li>
          <li>The file is locked with your PIN. Nobody can open it without your PIN, even if they find it.</li>
        </ol>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          disabled={exporting || notes.length === 0}
          onClick={() => setExportGate("evidence")}
          className="min-h-[48px] flex items-center gap-2"
        >
          <ShieldCheck className="w-4 h-4" />
          Export Evidence Pack
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={() => setExportGate("backup")}
          className="min-h-[48px] flex items-center gap-2"
        >
          <FileDown className="w-4 h-4" />
          Export Encrypted Backup
        </Button>
      </div>
      {notes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add a note with a photo or recording first to enable the evidence pack export.
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ChefHat className="w-4 h-4 text-primary" />
          How to restore on a new phone
        </h3>
        <ol className="space-y-2 text-sm text-muted-foreground leading-relaxed list-decimal list-inside">
          <li>Open this app on the new phone (it will look like a recipe app).</li>
          <li>Press and hold the chef hat icon at the top of the recipe screen for about a second.</li>
          <li>Choose your backup file.</li>
          <li>Enter the PIN you used when you made that backup.</li>
          <li>Your notes, vault, and photos will be restored onto the new phone.</li>
        </ol>
      </div>

      {/* Export gate: re-entering the PIN here is a deliberate confirm-intent step,
          even though the app is already unlocked — exporting evidence/backup is
          higher-stakes than viewing notes. */}
      {exportGate && (
        <div className="fixed inset-0 z-50">
          <LoyaltyGate
            onSuccess={() => {
              const action = exportGate;
              setExportGate(null);
              if (action === "evidence") void runExportEvidencePack();
              else void runExportBackup();
            }}
            onBack={() => setExportGate(null)}
          />
        </div>
      )}
    </div>
  );
};

export default BackupRestore;
