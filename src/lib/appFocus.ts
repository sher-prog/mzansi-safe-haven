/**
 * Tracks "intentional handoffs" — moments where we deliberately send the page to the
 * background (opening a file picker/camera, a mic permission prompt, an SMS/tel link)
 * and don't want that to be treated as the user abandoning the app.
 *
 * The deadline is checked lazily (no setTimeout) because background tabs throttle
 * timers, so a real timer could fire late or not at all while hidden.
 */

const HANDOFF_TIMEOUT_MS = 3 * 60 * 1000;

let handoffDeadline: number | null = null;

export function beginHandoff(): void {
  handoffDeadline = Date.now() + HANDOFF_TIMEOUT_MS;
}

export function endHandoff(): void {
  handoffDeadline = null;
}

export function isHandoffActive(): boolean {
  if (handoffDeadline === null) return false;
  if (Date.now() >= handoffDeadline) {
    handoffDeadline = null;
    return false;
  }
  return true;
}
