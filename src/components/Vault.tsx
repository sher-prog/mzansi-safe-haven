import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Camera, Trash2, ChevronDown, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { checkStorageUsage } from "@/lib/mediaHelpers";
import { getItem, setItem, SecureStorageLockedError } from "@/lib/secureStorage";
import { beginHandoff } from "@/lib/appFocus";
import { capturePhoto, normalizeMediaRecord, UNRECOVERABLE_MEDIA_KEY, type MediaRecord, type MediaSource } from "@/lib/evidence";
import { deleteBlob } from "@/lib/blobStore";
import { useBlobUrl } from "@/hooks/use-blob-url";
import LoyaltyGate from "@/components/LoyaltyGate";
import { useTranslation } from "@/i18n";
import { toast } from "sonner";

type Category = "ID" | "Financial" | "Medical" | "Legal" | "Property" | "Other";

interface VaultDoc {
  id: string;
  category: Category;
  title: string;
  notes: string;
  createdAt: string;
  photo?: MediaRecord;
}

/** Displayed thumbnail is always the compressed copy — the original stays untouched
 * in the blob store, pulled only for evidence export. */
const MediaThumb = ({ media, className, alt }: { media: MediaRecord; className?: string; alt: string }) => {
  const { t } = useTranslation();
  const { url, failed } = useBlobUrl(
    media.originalKey === UNRECOVERABLE_MEDIA_KEY ? undefined : (media.thumbKey ?? media.originalKey),
  );
  if (media.originalKey === UNRECOVERABLE_MEDIA_KEY) {
    return <p className="text-xs text-amber-600">{t("evidenceMeta.unrecoverable")}</p>;
  }
  if (failed) return <p className="text-xs text-amber-600">{t("evidenceMeta.loadError")}</p>;
  if (!url) return <div className={`${className} bg-muted animate-pulse`} />;
  return <img src={url} alt={alt} className={className} />;
};

const EvidenceMeta = ({ media }: { media: MediaRecord }) => {
  const { t } = useTranslation();
  if (media.originalKey === UNRECOVERABLE_MEDIA_KEY) return null;
  return (
    <p className="text-[10px] mt-1 break-all text-muted-foreground">
      {t("evidenceMeta.captured", { date: new Date(media.capturedAt).toLocaleString() })}
      {" • "}
      {media.gps
        ? t("evidenceMeta.gps", { lat: media.gps.lat.toFixed(5), lng: media.gps.lng.toFixed(5) })
        : t("evidenceMeta.gpsNotCaptured")}
      {" • "}
      {t("evidenceMeta.sha256", { hash: media.sha256.slice(0, 16) })}
    </p>
  );
};

const CATEGORIES: Category[] = ["ID", "Financial", "Medical", "Legal", "Property", "Other"];

const Vault = () => {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | "All">("All");
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

  const [category, setCategory] = useState<Category>("ID");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<MediaRecord | undefined>();
  const [showImportNotice, setShowImportNotice] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pendingPhotoRef = useRef<{ file: File; source: MediaSource } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getItem<VaultDoc[]>("vault_docs");
        if (stored) {
          // See SafetyNotes.tsx's identical load-time normalization for why: MediaRecord
          // has gained fields over time with no migration for records saved in between.
          const normalized = await Promise.all(
            stored.map(async (doc) => ({
              ...doc,
              photo: doc.photo ? await normalizeMediaRecord(doc.photo, doc.createdAt) : undefined,
            })),
          );
          setDocs(normalized);
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error("Failed to load vault docs:", e);
      }
    })();
  }, []);

  const saveDocs = async (newDocs: VaultDoc[]) => {
    await setItem("vault_docs", newDocs);
    setDocs(newDocs);
    const status = await checkStorageUsage();
    if (status.level === "critical") toast.error(status.message!);
    else if (status.level === "warning") toast.warning(status.message!);
  };

  const resetForm = () => {
    setTitle("");
    setNotes("");
    setCategory("ID");
    setPhoto(undefined);
    pendingPhotoRef.current = null;
    setShowImportNotice(false);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const newDoc: VaultDoc = {
      id: crypto.randomUUID(),
      category,
      title: title.trim(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      ...(photo && { photo }),
    };
    try {
      await saveDocs([newDoc, ...docs]);
      resetForm();
    } catch (error) {
      if (error instanceof SecureStorageLockedError) {
        setShowUnlockPrompt(true);
      } else {
        if (import.meta.env.DEV) console.error("Failed to save document:", error);
        toast.error(t("vault.saveError"));
      }
    }
  };

  const handleDelete = async (id: string) => {
    const doc = docs.find((d) => d.id === id);
    try {
      await saveDocs(docs.filter((d) => d.id !== id));
      if (doc?.photo) {
        deleteBlob(doc.photo.originalKey).catch(() => {});
        if (doc.photo.thumbKey) deleteBlob(doc.photo.thumbKey).catch(() => {});
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error("Failed to delete document:", error);
      toast.error(t("vault.saveError"));
    }
    setExpandedDoc(null);
    setShowDeleteConfirm(null);
  };

  // Captures the ORIGINAL file untouched (hashed, stored, timestamped, geotagged);
  // compressImage (inside capturePhoto) only ever produces a separate display thumbnail.
  // `source` records whether this came from the camera just now or an existing gallery
  // file, which the evidence pack captions differently (see src/lib/exportPack.ts).
  const processPhotoFile = async (file: File, source: MediaSource) => {
    const status = await checkStorageUsage();
    if (status.level === "critical") {
      toast.error(status.message ?? t("vault.saveError"));
      return;
    }
    try {
      const media = await capturePhoto(file, source);
      setPhoto(media);
      pendingPhotoRef.current = null;
      if (source === "imported") setShowImportNotice(true);
    } catch (error) {
      if (error instanceof SecureStorageLockedError) {
        pendingPhotoRef.current = { file, source };
        setShowUnlockPrompt(true);
      } else {
        if (import.meta.env.DEV) console.error("Failed to process photo:", error);
        toast.error(t("vault.photoError"));
      }
    }
  };

  const handleCameraSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPhotoFile(file, "captured");
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPhotoFile(file, "imported");
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleUnlockSuccess = async () => {
    setShowUnlockPrompt(false);
    if (pendingPhotoRef.current) {
      const { file, source } = pendingPhotoRef.current;
      pendingPhotoRef.current = null;
      await processPhotoFile(file, source);
      return;
    }
    await handleSave();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const filtered = filterCategory === "All" ? docs : docs.filter((d) => d.category === filterCategory);

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("vault.title")}</h1>
          <p className="text-sm mt-1 text-muted-foreground">{t("vault.subtitle")}</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t("vault.addDocument")}
        </Button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap mb-5" role="group" aria-label={t("vault.form.category")}>
        {(["All", ...CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            aria-pressed={filterCategory === cat}
            className={`px-3 py-1.5 min-h-[36px] rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filterCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {cat === "All" ? t("vault.all") : t(`vault.categories.${cat}`)}
          </button>
        ))}
      </div>

      {/* Documents List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("vault.empty")}</p>
            <p className="text-sm mt-1">{t("vault.emptyHint")}</p>
          </div>
        ) : (
          filtered.map((doc) => (
            <motion.div key={doc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card
                className="cursor-pointer bg-card border-border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                role="button"
                tabIndex={0}
                onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedDoc(expandedDoc === doc.id ? null : doc.id);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      {t(`vault.categories.${doc.category}`)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
                        {doc.photo && <ImageIcon className="w-3 h-3 text-muted-foreground" aria-hidden="true" />}
                      </div>
                      <p className="font-medium text-foreground">{doc.title}</p>

                      {expandedDoc !== doc.id && doc.photo && (
                        <MediaThumb media={doc.photo} alt={t("vault.photo")} className="mt-2 w-16 h-16 object-cover rounded" />
                      )}

                      {expandedDoc === doc.id && (
                        <>
                          {doc.notes && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <p className="text-xs mb-1 text-muted-foreground">{t("vault.notes")}</p>
                              <p className="text-sm text-foreground">{doc.notes}</p>
                            </div>
                          )}
                          {doc.photo && (
                            <div className="mt-3">
                              <p className="text-xs mb-1 text-muted-foreground">{t("vault.photo")}</p>
                              <MediaThumb media={doc.photo} alt={t("vault.photo")} className="w-full max-w-md rounded-lg" />
                              <EvidenceMeta media={doc.photo} />
                            </div>
                          )}
                          <div className="mt-4 flex justify-end">
                            <Button
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(doc.id); }}
                              variant="destructive"
                              size="sm"
                              aria-label={t("vault.deleteLabel")}
                              className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                              {t("common.delete")}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform text-muted-foreground ${expandedDoc === doc.id ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Hidden file inputs — camera capture vs. an existing gallery file are separate
          inputs so the app knows which the user actually chose (see MediaRecord.source
          in src/lib/evidence.ts). */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraSelect} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleGallerySelect} />

      {/* New Document Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vault.form.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <span className="block text-sm mb-1 text-muted-foreground">{t("vault.form.category")}</span>
              <div className="flex gap-2 flex-wrap" role="group" aria-label={t("vault.form.category")}>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    aria-pressed={category === cat}
                    className={`px-3 py-1.5 min-h-[36px] rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      category === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {t(`vault.categories.${cat}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="vault-title" className="block text-sm mb-1 text-muted-foreground">{t("vault.form.titleLabel")}</label>
              <Input
                id="vault-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("vault.form.titlePlaceholder")}
                className="min-h-[48px]"
              />
            </div>

            <div>
              <label htmlFor="vault-notes" className="block text-sm mb-1 text-muted-foreground">{t("vault.form.notesLabel")}</label>
              <Textarea
                id="vault-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("vault.form.notesPlaceholder")}
                className="min-h-[100px] resize-none"
              />
            </div>

            <div>
              <span className="block text-sm mb-2 text-muted-foreground">{t("vault.form.photoLabel")}</span>
              <p className="text-xs mb-2 text-muted-foreground">{t("vault.form.photoHint")}</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={() => { beginHandoff(); cameraInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  {t("vault.form.takePhoto")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { beginHandoff(); galleryInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ImageIcon className="w-4 h-4" aria-hidden="true" />
                  {t("vault.form.addFromGallery")}
                </Button>
              </div>
              {photo && (
                <div className="mt-3 relative inline-block">
                  <MediaThumb media={photo} alt={t("vault.form.takePhoto")} className="w-24 h-24 object-cover rounded-lg" />
                  <button
                    onClick={() => setPhoto(undefined)}
                    aria-label={t("vault.form.removePhotoLabel")}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:absolute before:-inset-2.5 before:content-['']"
                  >
                    ✕
                  </button>
                  <EvidenceMeta media={photo} />
                </div>
              )}
              {showImportNotice && (
                <div className="mt-3 flex items-start gap-2 rounded-lg p-3 bg-primary/10 border border-primary/20">
                  <p className="text-xs leading-relaxed flex-1 text-muted-foreground">{t("vault.form.importNotice")}</p>
                  <button
                    onClick={() => setShowImportNotice(false)}
                    aria-label={t("common.dismiss")}
                    className="relative text-xs flex-shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded before:absolute before:-inset-2.5 before:content-['']"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={resetForm}
              className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title.trim()}
              className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("vault.form.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vault.deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{t("common.no")}</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)} className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{t("common.yes")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-unlock prompt: shown if the store locked before the document/photo could be
          saved. The pending document (and any captured photo) stays in memory so the
          save completes automatically once the PIN is re-entered. */}
      {showUnlockPrompt && (
        <div className="fixed inset-0 z-50">
          <LoyaltyGate
            onSuccess={() => { void handleUnlockSuccess(); }}
            onBack={() => setShowUnlockPrompt(false)}
          />
        </div>
      )}
    </div>
  );
};

export default Vault;
