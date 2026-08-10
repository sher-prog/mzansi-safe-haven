import { useState, useEffect } from "react";
import { Save, ShieldCheck, FileDown, ChefHat, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getItem } from "@/lib/secureStorage";
import type { EvidencePackNote } from "@/lib/exportPack";
import { exportBackup } from "@/lib/backup";
import { downloadBlob } from "@/lib/download";
import { isStoragePersisted } from "@/lib/storagePersistence";
import LoyaltyGate from "@/components/LoyaltyGate";
import { useTranslation } from "@/i18n";
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
  const { t } = useTranslation();
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
      // jsPDF pulls in html2canvas/dompurify (~60KB gzipped) — nobody browsing
      // Notes/Vault/Checklist should pay for that, only someone who actually taps
      // this button, so it's loaded on demand rather than bundled with the rest of
      // safety mode.
      const { generateEvidencePackPdf } = await import("@/lib/exportPack");
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
      toast.success(t("backup.evidencePackDownloaded"));
    } catch (error) {
      if (import.meta.env.DEV) console.error("Failed to generate evidence pack:", error);
      toast.error(t("backup.evidencePackError"));
    } finally {
      setExporting(false);
    }
  };

  const runExportBackup = async () => {
    setExporting(true);
    try {
      const blob = await exportBackup();
      downloadBlob(blob, `safeexit-backup-${new Date().toISOString().slice(0, 10)}.safeexit`);
      toast.success(t("backup.backupDownloaded"));
    } catch (error) {
      if (import.meta.env.DEV) console.error("Failed to export backup:", error);
      toast.error(t("backup.backupError"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Save className="w-5 h-5 text-primary" aria-hidden="true" />
          {t("backup.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("backup.subtitle")}</p>
      </div>

      {persisted === false && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-muted-foreground leading-relaxed">{t("backup.persistWarning")}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t("backup.whyTitle")}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{t("backup.whyBody")}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t("backup.howToBackupTitle")}</h3>
        <ol className="space-y-2 text-sm text-muted-foreground leading-relaxed list-decimal list-inside">
          <li>{t("backup.howToBackup1")}</li>
          <li>{t("backup.howToBackup2")}</li>
          <li>{t("backup.howToBackup3")}</li>
        </ol>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          disabled={exporting || notes.length === 0}
          onClick={() => setExportGate("evidence")}
          className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          {t("backup.exportEvidencePack")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={() => setExportGate("backup")}
          className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <FileDown className="w-4 h-4" aria-hidden="true" />
          {t("backup.exportBackup")}
        </Button>
      </div>
      {notes.length === 0 && <p className="text-xs text-muted-foreground">{t("backup.needNoteHint")}</p>}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ChefHat className="w-4 h-4 text-primary" aria-hidden="true" />
          {t("backup.howToRestoreTitle")}
        </h3>
        <ol className="space-y-2 text-sm text-muted-foreground leading-relaxed list-decimal list-inside">
          <li>{t("backup.howToRestore1")}</li>
          <li>{t("backup.howToRestore2")}</li>
          <li>{t("backup.howToRestore3")}</li>
          <li>{t("backup.howToRestore4")}</li>
          <li>{t("backup.howToRestore5")}</li>
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
