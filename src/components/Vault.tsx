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
import { capturePhoto, type MediaRecord, type MediaSource } from "@/lib/evidence";
import { deleteBlob } from "@/lib/blobStore";
import { useBlobUrl } from "@/hooks/use-blob-url";
import LoyaltyGate from "@/components/LoyaltyGate";
import { toast } from "sonner";

interface VaultDoc {
  id: string;
  category: "ID" | "Financial" | "Medical" | "Legal" | "Property" | "Other";
  title: string;
  notes: string;
  createdAt: string;
  photo?: MediaRecord;
}

/** Displayed thumbnail is always the compressed copy — the original stays untouched
 * in the blob store, pulled only for evidence export. */
const MediaThumb = ({ media, className, alt }: { media: MediaRecord; className?: string; alt: string }) => {
  const url = useBlobUrl(media.thumbKey ?? media.originalKey);
  if (!url) return <div className={`${className} bg-slate-200 animate-pulse`} />;
  return <img src={url} alt={alt} className={className} />;
};

const EvidenceMeta = ({ media }: { media: MediaRecord }) => (
  <p className="text-[10px] mt-1 break-all" style={{ color: "#94A3B8" }}>
    Captured {new Date(media.capturedAt).toLocaleString()}
    {media.gps ? ` • GPS ${media.gps.lat.toFixed(5)}, ${media.gps.lng.toFixed(5)}` : " • GPS not captured"}
    {` • SHA-256 ${media.sha256.slice(0, 16)}…`}
  </p>
);

const CATEGORIES: VaultDoc["category"][] = ["ID", "Financial", "Medical", "Legal", "Property", "Other"];

const Vault = () => {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<VaultDoc["category"] | "All">("All");
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

  const [category, setCategory] = useState<VaultDoc["category"]>("ID");
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
        if (stored) setDocs(stored);
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
        toast.error("Failed to save. Storage may be full.");
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
      toast.error("Failed to save. Storage may be full.");
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
      toast.error(status.message ?? "Storage is almost full.");
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
        toast.error("Failed to process photo.");
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
    <div style={{ backgroundColor: "#FFFFFF" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0F172A" }}>Document Vault</h1>
          <p className="text-sm mt-1" style={{ color: "#64748B" }}>Store important documents securely</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="min-h-[48px] flex items-center gap-2"
          style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}
        >
          <Plus className="w-4 h-4" />
          Add Document
        </Button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap mb-5">
        {(["All", ...CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: filterCategory === cat ? "#0F172A" : "#F1F5F9",
              color: filterCategory === cat ? "#FFFFFF" : "#475569",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Documents List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#64748B" }}>
            <p>No documents yet</p>
            <p className="text-sm mt-1">Tap "Add Document" to get started</p>
          </div>
        ) : (
          filtered.map((doc) => (
            <motion.div key={doc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card
                className="cursor-pointer"
                style={{ backgroundColor: "#F8FAFC", borderColor: "#E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
                onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: "#F1F5F9", color: "#475569" }}
                    >
                      {doc.category}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs" style={{ color: "#64748B" }}>{formatDate(doc.createdAt)}</span>
                        {doc.photo && <ImageIcon className="w-3 h-3" style={{ color: "#64748B" }} />}
                      </div>
                      <p className="font-medium" style={{ color: "#0F172A" }}>{doc.title}</p>

                      {expandedDoc !== doc.id && doc.photo && (
                        <MediaThumb media={doc.photo} alt="Document" className="mt-2 w-16 h-16 object-cover rounded" />
                      )}

                      {expandedDoc === doc.id && (
                        <>
                          {doc.notes && (
                            <div className="mt-3 pt-3" style={{ borderTop: "1px solid #E2E8F0" }}>
                              <p className="text-xs mb-1" style={{ color: "#64748B" }}>Notes:</p>
                              <p className="text-sm" style={{ color: "#0F172A" }}>{doc.notes}</p>
                            </div>
                          )}
                          {doc.photo && (
                            <div className="mt-3">
                              <p className="text-xs mb-1" style={{ color: "#64748B" }}>Photo:</p>
                              <MediaThumb media={doc.photo} alt="Document" className="w-full max-w-md rounded-lg" />
                              <EvidenceMeta media={doc.photo} />
                            </div>
                          )}
                          <div className="mt-4 flex justify-end">
                            <Button
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(doc.id); }}
                              variant="destructive"
                              size="sm"
                              className="min-h-[48px] flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${expandedDoc === doc.id ? "rotate-180" : ""}`}
                      style={{ color: "#64748B" }}
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
        <DialogContent style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", color: "#0F172A" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#0F172A" }}>New Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: "#64748B" }}>Category</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: category === cat ? "#0F172A" : "#F1F5F9",
                      color: category === cat ? "#FFFFFF" : "#475569",
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "#64748B" }}>Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. ID Document, Bank Statement..."
                className="min-h-[48px]"
                style={{ backgroundColor: "#F8FAFC", borderColor: "#E2E8F0", color: "#0F172A" }}
              />
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "#64748B" }}>Notes (optional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes..."
                className="min-h-[100px] resize-none"
                style={{ backgroundColor: "#F8FAFC", borderColor: "#E2E8F0", color: "#0F172A" }}
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: "#64748B" }}>Photo</label>
              <p className="text-xs mb-2" style={{ color: "#94A3B8" }}>
                Taking a photo directly in the app is the stronger option for evidence — the
                timestamp and location are recorded at that exact moment.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={() => { beginHandoff(); cameraInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center gap-2"
                  style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}
                >
                  <Camera className="w-4 h-4" />
                  📷 Take Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { beginHandoff(); galleryInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center gap-2"
                  style={{ backgroundColor: "#F8FAFC", borderColor: "#E2E8F0", color: "#0F172A" }}
                >
                  <ImageIcon className="w-4 h-4" />
                  Add from Gallery
                </Button>
              </div>
              {photo && (
                <div className="mt-3 relative inline-block">
                  <MediaThumb media={photo} alt="Attached" className="w-24 h-24 object-cover rounded-lg" />
                  <button
                    onClick={() => setPhoto(undefined)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                  <EvidenceMeta media={photo} />
                </div>
              )}
              {showImportNotice && (
                <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                  <p className="text-xs leading-relaxed flex-1" style={{ color: "#1E3A8A" }}>
                    Saved securely. You can now delete the original from your gallery if you
                    wish — it will remain here.
                  </p>
                  <button
                    onClick={() => setShowImportNotice(false)}
                    aria-label="Dismiss"
                    className="text-xs flex-shrink-0"
                    style={{ color: "#1E3A8A" }}
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
              className="min-h-[48px]"
              style={{ borderColor: "#E2E8F0", color: "#0F172A" }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title.trim()}
              className="min-h-[48px]"
              style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}
            >
              Save Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", color: "#0F172A" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#0F172A" }}>Delete this document?</DialogTitle>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} className="min-h-[48px]" style={{ borderColor: "#E2E8F0", color: "#0F172A" }}>No</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)} className="min-h-[48px]">Yes</Button>
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
