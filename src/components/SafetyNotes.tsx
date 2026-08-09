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
import { toast } from "sonner";

interface Note {
  id: string;
  category: "Incident" | "Pattern" | "Timing" | "Important Info";
  what: string;
  trigger: string;
  createdAt: string;
  photo?: MediaRecord;
  audio?: MediaRecord;
}

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
  if (!url) return <div className={`${className} bg-slate-700 animate-pulse`} />;
  return <img src={url} alt={alt} className={className} />;
};

const MediaAudioPlayer = ({ media, className }: { media: MediaRecord; className?: string }) => {
  const url = useBlobUrl(media.originalKey);
  const [playbackError, setPlaybackError] = useState(false);
  if (!url) return null;
  if (playbackError) {
    return (
      <p className="text-xs text-amber-400">
        This recording can't play on this device. The original file is still saved
        and will be included if you export an evidence pack.
      </p>
    );
  }
  return <audio controls src={url} className={className} onError={() => setPlaybackError(true)} />;
};

const EvidenceMeta = ({ media }: { media: MediaRecord }) => (
  <p className="text-[10px] text-gray-500 mt-1 break-all">
    Captured {new Date(media.capturedAt).toLocaleString()}
    {media.gps ? ` • GPS ${media.gps.lat.toFixed(5)}, ${media.gps.lng.toFixed(5)}` : " • GPS not captured"}
    {` • SHA-256 ${media.sha256.slice(0, 16)}…`}
  </p>
);

const SafetyNotes = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

  // Form state
  const [category, setCategory] = useState<Note["category"]>("Incident");
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
        toast.error("Failed to save. Storage may be full.");
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
      toast.error("Failed to save. Storage may be full.");
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
  }, []);

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
      toast.error(status.message ?? "Storage is almost full.");
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
        toast.error("Failed to process recording.");
      }
    }
  }, []);

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
      toast.error("Microphone access denied.");
    }
  }, [clearCountdown, processAudioBlob, stopRecording]);

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

  const getCategoryColor = (cat: Note["category"]) => {
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
    <div className="min-h-screen" style={{ backgroundColor: '#0F172A' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Private Notes</h1>
          <p className="text-gray-400 text-sm">Record incidents and patterns privately</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white min-h-[48px] flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Note
        </Button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Exporting an evidence pack or a backup? Find them under the "Backup" tab.
      </p>

      {/* Notes List */}
      <div className="space-y-3">
        {notes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No notes yet</p>
            <p className="text-sm mt-1">Tap "New Note" to get started</p>
          </div>
        ) : (
          notes.map((note) => (
            <motion.div key={note.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card
                className="bg-slate-800 border-slate-700 cursor-pointer min-h-[48px]"
                onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge className={`${getCategoryColor(note.category)} text-white border-none`}>
                      {note.category}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-400">{formatDate(note.createdAt)}</span>
                        {note.photo && <ImageIcon className="w-3 h-3 text-blue-400" />}
                        {note.audio && <Mic className="w-3 h-3 text-red-400" />}
                      </div>
                      <p className="text-white text-sm">
                        {expandedNote === note.id ? note.what : truncateText(note.what)}
                      </p>

                      {/* Thumbnail in collapsed view */}
                      {expandedNote !== note.id && note.photo && (
                        <MediaThumb media={note.photo} alt="Evidence" className="mt-2 w-16 h-16 object-cover rounded" />
                      )}

                      {/* Expanded view */}
                      {expandedNote === note.id && (
                        <>
                          {note.trigger && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <p className="text-xs text-gray-400 mb-1">Trigger:</p>
                              <p className="text-white text-sm">{note.trigger}</p>
                            </div>
                          )}
                          {note.photo && (
                            <div className="mt-3">
                              <p className="text-xs text-gray-400 mb-1">Photo:</p>
                              <MediaThumb media={note.photo} alt="Evidence" className="w-full max-w-md rounded-lg" />
                              <EvidenceMeta media={note.photo} />
                            </div>
                          )}
                          {note.audio && (
                            <div className="mt-3">
                              <p className="text-xs text-gray-400 mb-1">Voice Recording:</p>
                              <MediaAudioPlayer media={note.audio} className="w-full" />
                              <EvidenceMeta media={note.audio} />
                            </div>
                          )}
                          <div className="mt-4 flex justify-end">
                            <Button
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(note.id); }}
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
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedNote === note.id ? 'rotate-180' : ''}`} />
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
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-[14px] mb-1" style={{ color: '#94A3B8' }}>Category</label>
              <Select value={category} onValueChange={(v: Note["category"]) => setCategory(v)}>
                <SelectTrigger className="min-h-[48px] w-full rounded-lg text-[16px] text-white border focus:ring-0 focus:ring-offset-0" style={{ background: '#1E293B', borderColor: '#334155', padding: '12px' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border" style={{ background: '#1E293B', borderColor: '#334155' }}>
                  <SelectItem value="Incident" className="text-white focus:text-white" style={{ background: '#1E293B' }}>Incident</SelectItem>
                  <SelectItem value="Pattern" className="text-white focus:text-white" style={{ background: '#1E293B' }}>Pattern</SelectItem>
                  <SelectItem value="Timing" className="text-white focus:text-white" style={{ background: '#1E293B' }}>Timing</SelectItem>
                  <SelectItem value="Important Info" className="text-white focus:text-white" style={{ background: '#1E293B' }}>Important Info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-[14px] mb-1" style={{ color: '#94A3B8' }}>What happened?</label>
              <Textarea
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder="Describe what happened..."
                className="w-full rounded-lg text-[16px] text-white resize-none min-h-[120px] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#64748B]"
                style={{ background: '#1E293B', borderColor: '#334155', padding: '12px' }}
                onFocus={(e) => e.target.style.borderColor = '#60A5FA'}
                onBlur={(e) => e.target.style.borderColor = '#334155'}
              />
            </div>

            <div>
              <label className="block text-[14px] mb-1" style={{ color: '#94A3B8' }}>What triggered it? (optional)</label>
              <Input
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder="What led to this..."
                className="w-full rounded-lg text-[16px] text-white min-h-[48px] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#64748B]"
                style={{ background: '#1E293B', borderColor: '#334155', padding: '12px' }}
                onFocus={(e) => e.target.style.borderColor = '#60A5FA'}
                onBlur={(e) => e.target.style.borderColor = '#334155'}
              />
            </div>

            {/* Media attachments */}
            <div>
              <label className="block text-[14px] mb-2" style={{ color: '#94A3B8' }}>Attachments</label>
              <p className="text-[11px] mb-2" style={{ color: '#64748B' }}>
                Photos and recordings are kept exactly as captured — for evidence, not
                recompressed — with a timestamp and integrity fingerprint. Taking a photo
                directly in the app is the stronger option: the timestamp and location are
                recorded at that exact moment, not guessed from an older file.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={() => { beginHandoff(); cameraInputRef.current?.click(); }}
                  className="min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  📷 Take Photo
                </Button>
                <Button
                  type="button"
                  onClick={() => { beginHandoff(); galleryInputRef.current?.click(); }}
                  className="min-h-[48px] text-white border border-slate-600 hover:bg-slate-700 flex items-center gap-2"
                  variant="outline"
                  style={{ background: '#1E293B', borderColor: '#334155' }}
                >
                  <ImageIcon className="w-4 h-4" />
                  Add from Gallery
                </Button>

                {!isRecording ? (
                  <Button
                    type="button"
                    onClick={startRecording}
                    className="min-h-[48px] text-white border border-slate-600 hover:bg-slate-700 flex items-center gap-2"
                    variant="outline"
                    style={{ background: '#1E293B', borderColor: '#334155' }}
                  >
                    <Mic className="w-4 h-4" />
                    🎤 Record Voice
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={stopRecording}
                    className="min-h-[48px] text-white border border-red-500 hover:bg-red-900/30 flex items-center gap-2 animate-pulse"
                    variant="outline"
                    style={{ background: '#1E293B', borderColor: '#EF4444' }}
                  >
                    <Square className="w-4 h-4 text-red-500" />
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    ⏹ Stop ({formatCountdown(recordingSecondsLeft)})
                  </Button>
                )}
              </div>

              {/* Photo preview */}
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
                <div className="mt-3 flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-gray-300 leading-relaxed flex-1">
                    Saved securely. You can now delete the original from your gallery if you
                    wish — it will remain here.
                  </p>
                  <button
                    onClick={() => setShowImportNotice(false)}
                    aria-label="Dismiss"
                    className="text-gray-400 hover:text-white text-xs flex-shrink-0"
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
                    className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[14px] mb-1" style={{ color: '#94A3B8' }}>Date & Time</label>
              <p className="text-sm" style={{ color: '#94A3B8' }}>{formatDate(new Date().toISOString())}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} className="border-slate-600 text-white hover:bg-slate-700 min-h-[48px]">
              Cancel
            </Button>
            <Button onClick={handleSaveNote} disabled={!what.trim()} className="bg-blue-600 hover:bg-blue-700 min-h-[48px]">
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} className="border-slate-600 text-white hover:bg-slate-700 min-h-[48px]">No</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && handleDeleteNote(showDeleteConfirm)} className="min-h-[48px]">Yes</Button>
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
