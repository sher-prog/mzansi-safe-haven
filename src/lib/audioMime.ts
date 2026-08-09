/**
 * Picks a MediaRecorder mimeType from a priority list, keeping only whichever the
 * running browser's `MediaRecorder.isTypeSupported()` actually confirms.
 *
 * audio/mp4 comes first deliberately: Safari (iOS and macOS) can only ever record
 * and play back MP4/AAC — it has no WebM decoder at all, in any version, as a fixed
 * platform limitation rather than a bug. Chrome and Android can both record AND
 * play mp4 too where it's available, so preferring it everywhere (not just on
 * Safari) means this app never produces a recording that its own playback can't
 * decode on some other browser. Where mp4 recording isn't supported (older
 * Firefox, some Android WebViews), we fall back to whatever webm/ogg variant the
 * browser does support — recorded and played back on that same browser, which is
 * exactly what those formats are actually good for.
 */
const AUDIO_MIME_CANDIDATES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return AUDIO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}
