import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Calendar, ChevronDown, Trash2, Camera, Mic, Square, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { checkStorageUsage } from "@/lib/mediaHelpers";
import { getItem, setItem, SecureStorageLockedError } from "@/lib/secureStorage";
import { beginHandoff } from "@/lib/appFocus";
import { capturePhoto, captureAudio, type MediaRecord, type MediaSource } from "@/lib/evidence";
import { pickAudioMimeType } from "@/lib/audioMime";
import { deleteBlob } from "@/lib/blobStore";
import { useBlobUrl } from "@/hooks/use-blob-url";
import LoyaltyGate from "@/components/LoyaltyGate";
import { useTranslation } from "@/i18n";
import { toast } from "sonner";

type Category = "Incident" | "Pattern" | "Timing" | "Important Info";

interface Note {
  id: string;
  category: Category;
  what: string;
  trigger: string;
  createdAt: string;
  photo?: MediaRecord;
  audio?: MediaRecord;
}

const CATEGORIES: Category[] = ["Incident", "Pattern", "Timing", "Important Info"];
const RECORDING_LIMIT_SECONDS = 180;

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/** Displayed thumbnail is always the compressed copy — the original stays untouched
 * in the blob store and is only ever pulled for export. */
const MediaThumb = ({ media, className, alt }: { media: MediaRecord; className?: string; alt: string }) => {
  const url = useBlobUrl(media.thumbKey ?? media.originalKey);
  if (!url) return <div className={`${className} bg-muted animate-pulse`} />;
  return <img src={url} alt={alt} className={className} />;
};

const MediaAudioPlayer = ({ media, className }: { media: MediaRecord; className?: string }) => {
  const { t } = useTranslation();
  const url = useBlobUrl(media.originalKey);
  const [playbackError, setPlaybackError] = useState(false);
  if (!url) return null;
  if (playbackError) {
    return <p className="text-xs text-amber-600">{t("notes.playbackError")}</p>;
  }
  return <audio controls src={url} className={className} onError={() => setPlaybackError(true)} />;
};

const EvidenceMeta = ({ media }: { media: MediaRecord }) => {
  const { t } = useTranslation();
  return (
    <p className="text-[10px] text-muted-foreground mt-1 break-all">
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

const SafetyNotes = () => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

  // Form state
  const [category, setCategory] = useState<Category>("Incident");
  const [what, setWhat] = useState("");
  const [trigger, setTrigger] = useState("");
  const [photo, setPhoto] = useState<MediaRecord | undefined>();
  const [audio, setAudio] = useState<MediaRecord | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecondsLeft, setRecordingSecondsLeft] = useState(RECORDING_LIMIT_SECONDS);
  const [showImportNotice, setShowImportNotice] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPhotoRef = useRef<{ file: File; source: MediaSource } | null>(null);
  const pendingAudioBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getItem<Note[]>('notes');
        if (stored) setNotes(stored);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Failed to load notes:', error);
      }
    })();
  }, []);

  const saveNotes = async (newNotes: Note[]) => {
    await setItem('notes', newNotes);
    setNotes(newNotes);
    const status = await checkStorageUsage();
    if (status.level === "critical") toast.error(status.message!);
    else if (status.level === "warning") toast.warning(status.message!);
  };

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const resetForm = () => {
    setWhat("");
    setTrigger("");
    setCategory("Incident");
    setPhoto(undefined);
    setAudio(undefined);
    setIsRecording(false);
    setRecordingSecondsLeft(RECORDING_LIMIT_SECONDS);
    clearCountdown();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    pendingPhotoRef.current = null;
    pendingAudioBlobRef.current = null;
    setShowImportNotice(false);
    setShowForm(false);
  };

  const handleSaveNote = async () => {
    if (!what.trim()) return;

    const newNote: Note = {
      id: crypto.randomUUID(),
      category,
      what: what.trim(),
      trigger: trigger.trim(),
      createdAt: new Date().toISOString(),
      ...(photo && { photo }),
      ...(audio && { audio }),
    };

    try {
      await saveNotes([newNote, ...notes]);
      resetForm();
    } catch (error) {
      if (error instanceof SecureStorageLockedError) {
        setShowUnlockPrompt(true);
      } else {
        if (import.meta.env.DEV) console.error('Failed to save note:', error);
        toast.error(t("notes.saveError"));
      }
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    try {
      await saveNotes(notes.filter(n => n.id !== noteId));
      // Best-effort cleanup — an orphaned blob is wasted space, not a correctness problem.
      if (note?.photo) {
        deleteBlob(note.photo.originalKey).catch(() => {});
        if (note.photo.thumbKey) deleteBlob(note.photo.thumbKey).catch(() => {});
      }
      if (note?.audio) deleteBlob(note.audio.originalKey).catch(() => {});
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to delete note:', error);
      toast.error(t("notes.saveError"));
    }
    setExpandedNote(null);
    setShowDeleteConfirm(null);
  };

  // Photo handling — captures the ORIGINAL file untouched (hashed, stored, timestamped,
  // geotagged); compressImage only ever produces a separate, display-only thumbnail.
  // `source` records whether this came from the camera just now or an existing gallery
  // file, which the evidence pack captions differently (see src/lib/exportPack.ts).
  const processPhotoFile = useCallback(async (file: File, source: MediaSource) => {
    const status = await checkStorageUsage();
    if (status.level === "critical") {
      toast.error(status.message ?? t("notes.saveError"));
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
        toast.error(t("notes.photoError"));
      }
    }
  }, [t]);

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

  const processAudioBlob = useCallback(async (blob: Blob) => {
    const status = await checkStorageUsage();
    if (status.level === "critical") {
      toast.error(status.message ?? t("notes.saveError"));
      return;
    }
    try {
      const media = await captureAudio(blob);
      setAudio(media);
      pendingAudioBlobRef.current = null;
    } catch (error) {
      if (error instanceof SecureStorageLockedError) {
        pendingAudioBlobRef.current = blob;
        setShowUnlockPrompt(true);
      } else {
        if (import.meta.env.DEV) console.error("Failed to process recording:", error);
        toast.error(t("notes.recordingError"));
      }
    }
  }, [t]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    clearCountdown();
  }, [clearCountdown]);

  // Voice recording — capped at 3 minutes with a visible countdown and auto-stop;
  // beginHandoff() covers the mic permission prompt, which can background the page.
  const startRecording = useCallback(async () => {
    beginHandoff();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // audio/mp4 is preferred — see src/lib/audioMime.ts for why — but the browser
      // has the final say, so recorder.mimeType (read at stop time, below) is what
      // actually gets stored, never a hardcoded guess.
      const requestedMimeType = pickAudioMimeType();
      const recorder = requestedMimeType ? new MediaRecorder(stream, { mimeType: requestedMimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Labelling this with anything other than what the browser actually recorded
        // is exactly what broke playback before: Safari can only ever decode mp4, and
        // a wrong "audio/webm" label made an otherwise-valid recording unplayable.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || requestedMimeType || "audio/mp4" });
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        clearCountdown();
        void processAudioBlob(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSecondsLeft(RECORDING_LIMIT_SECONDS);
      countdownRef.current = setInterval(() => {
        setRecordingSecondsLeft((s) => {
          if (s <= 1) {
            stopRecording();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch {
      toast.error(t("notes.micDenied"));
    }
  }, [clearCountdown, processAudioBlob, stopRecording, t]);

  const handleUnlockSuccess = async () => {
    setShowUnlockPrompt(false);
    if (pendingPhotoRef.current) {
      const { file, source } = pendingPhotoRef.current;
      pendingPhotoRef.current = null;
      await processPhotoFile(file, source);
      return;
    }
    if (pendingAudioBlobRef.current) {
      const blob = pendingAudioBlobRef.current;
      pendingAudioBlobRef.current = null;
      await processAudioBlob(blob);
      return;
    }
    await handleSaveNote();
  };

  const getCategoryColor = (cat: Category) => {
    switch (cat) {
      case "Incident": return "bg-red-600";
      case "Pattern": return "bg-amber-600";
      case "Timing": return "bg-blue-600";
      case "Important Info": return "bg-green-600";
      default: return "bg-gray-600";
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const truncateText = (text: string, max = 100) =>
    text.length > max ? text.substring(0, max) + "..." : text;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{t("notes.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("notes.subtitle")}</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t("notes.newNote")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-4">{t("notes.findExportsHint")}</p>

      {/* Notes List */}
      <div className="space-y-3">
        {notes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("notes.empty")}</p>
            <p className="text-sm mt-1">{t("notes.emptyHint")}</p>
          </div>
        ) : (
          notes.map((note) => (
            <motion.div key={note.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card
                className="bg-card border-border cursor-pointer min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                role="button"
                tabIndex={0}
                onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedNote(expandedNote === note.id ? null : note.id);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge className={`${getCategoryColor(note.category)} text-white border-none`}>
                      {t(`notes.form.categories.${note.category}`)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                        <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                        {note.photo && <ImageIcon className="w-3 h-3 text-primary" aria-hidden="true" />}
                        {note.audio && <Mic className="w-3 h-3 text-destructive" aria-hidden="true" />}
                      </div>
                      <p className="text-foreground text-sm">
                        {expandedNote === note.id ? note.what : truncateText(note.what)}
                      </p>

                      {/* Thumbnail in collapsed view */}
                      {expandedNote !== note.id && note.photo && (
                        <MediaThumb media={note.photo} alt={t("notes.photo")} className="mt-2 w-16 h-16 object-cover rounded" />
                      )}

                      {/* Expanded view */}
                      {expandedNote === note.id && (
                        <>
                          {note.trigger && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-1">{t("notes.trigger")}</p>
                              <p className="text-foreground text-sm">{note.trigger}</p>
                            </div>
                          )}
                          {note.photo && (
                            <div className="mt-3">
                              <p className="text-xs text-muted-foreground mb-1">{t("notes.photo")}</p>
                              <MediaThumb media={note.photo} alt={t("notes.photo")} className="w-full max-w-md rounded-lg" />
                              <EvidenceMeta media={note.photo} />
                            </div>
                          )}
                          {note.audio && (
                            <div className="mt-3">
                              <p className="text-xs text-muted-foreground mb-1">{t("notes.voiceRecording")}</p>
                              <MediaAudioPlayer media={note.audio} className="w-full" />
                              <EvidenceMeta media={note.audio} />
                            </div>
                          )}
                          <div className="mt-4 flex justify-end">
                            <Button
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(note.id); }}
                              variant="destructive"
                              size="sm"
                              aria-label={t("notes.deleteLabel")}
                              className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                              {t("common.delete")}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedNote === note.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Hidden file inputs — camera capture (capture="environment") vs. an existing
          gallery file are separate inputs so the app knows which the user actually
          chose (see MediaRecord.source in src/lib/evidence.ts). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraSelect}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGallerySelect}
      />

      {/* New Note Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("notes.form.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="note-category" className="block text-sm mb-1 text-muted-foreground">{t("notes.form.category")}</label>
              <Select value={category} onValueChange={(v: Category) => setCategory(v)}>
                <SelectTrigger id="note-category" className="min-h-[48px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`notes.form.categories.${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="note-what" className="block text-sm mb-1 text-muted-foreground">{t("notes.form.whatLabel")}</label>
              <Textarea
                id="note-what"
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder={t("notes.form.whatPlaceholder")}
                className="w-full resize-none min-h-[120px]"
              />
            </div>

            <div>
              <label htmlFor="note-trigger" className="block text-sm mb-1 text-muted-foreground">{t("notes.form.triggerLabel")}</label>
              <Input
                id="note-trigger"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder={t("notes.form.triggerPlaceholder")}
                className="w-full min-h-[48px]"
              />
            </div>

            {/* Media attachments */}
            <div>
              <span className="block text-sm mb-2 text-muted-foreground">{t("notes.form.attachments")}</span>
              <p className="text-xs mb-2 text-muted-foreground">{t("notes.form.attachmentsHint")}</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={() => { beginHandoff(); cameraInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  {t("notes.form.takePhoto")}
                </Button>
                <Button
                  type="button"
                  onClick={() => { beginHandoff(); galleryInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  variant="outline"
                >
                  <ImageIcon className="w-4 h-4" aria-hidden="true" />
                  {t("notes.form.addFromGallery")}
                </Button>

                {!isRecording ? (
                  <Button
                    type="button"
                    onClick={startRecording}
                    className="min-h-[48px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    variant="outline"
                  >
                    <Mic className="w-4 h-4" aria-hidden="true" />
                    {t("notes.form.recordVoice")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={stopRecording}
                    className="min-h-[48px] flex items-center gap-2 animate-pulse border-destructive text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    variant="outline"
                  >
                    <Square className="w-4 h-4" aria-hidden="true" />
                    <span className="inline-block w-2 h-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
                    {t("notes.form.stopRecording", { time: formatCountdown(recordingSecondsLeft) })}
                  </Button>
                )}
              </div>

              {/* Photo preview */}
              {photo && (
                <div className="mt-3 relative inline-block">
                  <MediaThumb media={photo} alt={t("notes.form.takePhoto")} className="w-24 h-24 object-cover rounded-lg" />
                  <button
                    onClick={() => setPhoto(undefined)}
                    aria-label={t("notes.form.removePhotoLabel")}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:absolute before:-inset-2.5 before:content-['']"
                  >
                    ✕
                  </button>
                  <EvidenceMeta media={photo} />
                </div>
              )}

              {showImportNotice && (
                <div className="mt-3 flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">{t("notes.form.importNotice")}</p>
                  <button
                    onClick={() => setShowImportNotice(false)}
                    aria-label={t("common.dismiss")}
                    className="relative text-muted-foreground hover:text-foreground text-xs flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded before:absolute before:-inset-2.5 before:content-['']"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Audio preview */}
              {audio && (
                <div className="mt-3 flex items-start gap-2">
                  <div className="flex-1">
                    <MediaAudioPlayer media={audio} className="w-full" />
                    <EvidenceMeta media={audio} />
                  </div>
                  <button
                    onClick={() => setAudio(undefined)}
                    aria-label={t("notes.form.removeAudioLabel")}
                    className="relative w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:absolute before:-inset-2.5 before:content-['']"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div>
              <span className="block text-sm mb-1 text-muted-foreground">{t("notes.form.dateTime")}</span>
              <p className="text-sm text-muted-foreground">{formatDate(new Date().toISOString())}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveNote} disabled={!what.trim()} className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {t("notes.form.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("notes.deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{t("common.no")}</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && handleDeleteNote(showDeleteConfirm)} className="min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{t("common.yes")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-unlock prompt: shown if the store locked before the note/photo/audio could be
          saved. The pending note (and any captured photo/audio) stays in memory so the
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

export default SafetyNotes;
