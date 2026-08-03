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
import { compressImage, checkStorageUsage } from "@/lib/mediaHelpers";
import { getItem, setItem, SecureStorageLockedError } from "@/lib/secureStorage";
import { beginHandoff } from "@/lib/appFocus";
import LoyaltyGate from "@/components/LoyaltyGate";
import { toast } from "sonner";

interface Note {
  id: string;
  category: "Incident" | "Pattern" | "Timing" | "Important Info";
  what: string;
  trigger: string;
  createdAt: string;
  photo?: string;
  audio?: string;
}

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
  const [photo, setPhoto] = useState<string | undefined>();
  const [audio, setAudio] = useState<string | undefined>();
  const [isRecording, setIsRecording] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
    const warning = checkStorageUsage();
    if (warning) toast.warning(warning);
  };

  const resetForm = () => {
    setWhat("");
    setTrigger("");
    setCategory("Incident");
    setPhoto(undefined);
    setAudio(undefined);
    setIsRecording(false);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
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
    try {
      await saveNotes(notes.filter(n => n.id !== noteId));
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to delete note:', error);
      toast.error("Failed to save. Storage may be full.");
    }
    setExpandedNote(null);
    setShowDeleteConfirm(null);
  };

  // Photo handling
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
    } catch {
      toast.error("Failed to process photo.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Voice recording
  const startRecording = useCallback(async () => {
    beginHandoff();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAudio(base64);
        };
        reader.readAsDataURL(blob);
        setIsRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

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
                        <img src={note.photo} alt="Evidence" className="mt-2 w-16 h-16 object-cover rounded" />
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
                              <img src={note.photo} alt="Evidence" className="w-full max-w-md rounded-lg" />
                            </div>
                          )}
                          {note.audio && (
                            <div className="mt-3">
                              <p className="text-xs text-gray-400 mb-1">Voice Recording:</p>
                              <audio controls src={`data:audio/webm;base64,${note.audio}`} className="w-full" />
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

      {/* Hidden file input for camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelect}
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
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={() => { beginHandoff(); fileInputRef.current?.click(); }}
                  className="min-h-[48px] text-white border border-slate-600 hover:bg-slate-700 flex items-center gap-2"
                  variant="outline"
                  style={{ background: '#1E293B', borderColor: '#334155' }}
                >
                  <Camera className="w-4 h-4" />
                  📷 Add Photo
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
                    ⏹ Stop Recording
                  </Button>
                )}
              </div>

              {/* Photo preview */}
              {photo && (
                <div className="mt-3 relative inline-block">
                  <img src={photo} alt="Attached" className="w-24 h-24 object-cover rounded-lg" />
                  <button
                    onClick={() => setPhoto(undefined)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Audio preview */}
              {audio && (
                <div className="mt-3 flex items-center gap-2">
                  <audio controls src={`data:audio/webm;base64,${audio}`} className="flex-1" />
                  <button
                    onClick={() => setAudio(undefined)}
                    className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center"
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

      {/* Re-unlock prompt: shown if the store locked before the note could be saved.
          The note (including any photo/audio) stays in the form so Save can be retried. */}
      {showUnlockPrompt && (
        <div className="fixed inset-0 z-50">
          <LoyaltyGate
            onSuccess={() => { setShowUnlockPrompt(false); handleSaveNote(); }}
            onBack={() => setShowUnlockPrompt(false)}
          />
        </div>
      )}
    </div>
  );
};

export default SafetyNotes;
