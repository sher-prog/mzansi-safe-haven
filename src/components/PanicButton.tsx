import { useState, useEffect, useRef, useCallback } from "react";
import { Pencil, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getItem, setItem } from "@/lib/secureStorage";
import { beginHandoff } from "@/lib/appFocus";

interface TrustedContact {
  name: string;
  phone: string;
}

interface DesktopFallback {
  phone: string | null;
  message: string;
}

const TEARS_FALLBACK_TEL = "tel:0800083277";

/** sms:/tel: links don't do anything useful on most laptops (no default handler) and
 * on some Android devices without one configured — this is a coarse, best-effort
 * signal for "is this a device where those links are likely to actually work",
 * not a precise device check. */
function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia?.("(pointer: coarse)")?.matches) return true;
  if (navigator.maxTouchPoints > 0) return true;
  return false;
}

const PanicButton = () => {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const progressRef = useRef(0);
  const keyHoldActiveRef = useRef(false);

  const [contact, setContact] = useState<TrustedContact | null>(null);
  const [contactLoaded, setContactLoaded] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [fallback, setFallback] = useState<DesktopFallback | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await getItem<TrustedContact>("trusted_contact");
        setContact(saved);
        if (!saved) setShowContactForm(true);
      } catch {
        setShowContactForm(true);
      } finally {
        setContactLoaded(true);
      }
    })();
  }, []);

  // Pre-trigger GPS permission on mount
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(() => {}, () => {}, {
      timeout: 5000,
      maximumAge: 60000,
    });
  }, []);

  const handleSaveContact = useCallback(async () => {
    if (!formName.trim() || !formPhone.trim()) return;
    const newContact: TrustedContact = { name: formName.trim(), phone: formPhone.trim() };
    try {
      await setItem("trusted_contact", newContact);
      setContact(newContact);
      setShowContactForm(false);
      toast.success("Trusted contact saved.");
    } catch {
      toast.error("Failed to save trusted contact.");
    }
  }, [formName, formPhone]);

  const openEditContact = useCallback(() => {
    setFormName(contact?.name ?? "");
    setFormPhone(contact?.phone ?? "");
    setShowContactForm(true);
  }, [contact]);

  const sendSMS = useCallback(
    (lat?: number, lng?: number) => {
      if (!contact) return;
      const locationPart =
        lat !== undefined && lng !== undefined
          ? ` My location: https://maps.google.com/?q=${lat},${lng}`
          : "";
      const message = `URGENT: I need help.${locationPart} Please call me now. TEARS: 0800601010`;
      try {
        const link = document.createElement("a");
        link.href = `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
        link.click();
      } catch {
        toast.error("Couldn't open your messaging app. Try calling 0800 150 150 directly.");
      }
      // sms: links silently do nothing on most desktops (and some Android devices with
      // no default SMS handler) — offer a copyable fallback there, without changing
      // anything about the mobile path above, which still gets attempted either way.
      if (!isLikelyMobileDevice()) {
        setFallback({ phone: contact.phone, message });
      }
    },
    [contact],
  );

  const triggerPanic = useCallback(() => {
    // Opening the SMS/tel app backgrounds the page — this is not the user leaving
    // the app, so don't let it exit safety mode and lock mid-emergency.
    beginHandoff();

    if (!contact) {
      toast.info("No trusted contact set — connecting you to the TEARS helpline instead.");
      window.location.href = TEARS_FALLBACK_TEL;
      if (!isLikelyMobileDevice()) {
        setFallback({ phone: null, message: "TEARS Helpline: 0800 60 10 10" });
      }
      return;
    }

    if (!navigator.geolocation) {
      sendSMS();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => sendSMS(pos.coords.latitude, pos.coords.longitude),
      () => sendSMS(),
      { timeout: 10000, maximumAge: 0 },
    );
  }, [contact, sendSMS]);

  const startHold = useCallback(() => {
    if (intervalRef.current) return;
    setHolding(true);
    progressRef.current = 0;
    intervalRef.current = setInterval(() => {
      progressRef.current += 2.5;
      setProgress(progressRef.current);
      if (progressRef.current >= 100) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setHolding(false);
        setProgress(0);
        triggerPanic();
      }
    }, 50);
  }, [triggerPanic]);

  const cancelHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setProgress(0);
    progressRef.current = 0;
    setHolding(false);
  }, []);

  // Pointer events unify mouse/touch/pen into one stream, so there's a single hold
  // gesture implementation instead of parallel touch*/mouse* listeners that could
  // fire for the same physical press on a device that dispatches both.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startHold();
    },
    [startHold],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (keyHoldActiveRef.current) return; // ignore OS key-repeat
      keyHoldActiveRef.current = true;
      startHold();
    },
    [startHold],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== " " && e.key !== "Enter") return;
      keyHoldActiveRef.current = false;
      cancelHold();
    },
    [cancelHold],
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleCopyMessage = useCallback(async () => {
    if (!fallback) return;
    const text = fallback.phone ? `${fallback.phone}: ${fallback.message}` : fallback.message;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically — please select and copy the text manually.");
    }
  }, [fallback]);

  const dasharray = 283;
  const dashoffset = dasharray - (dasharray * progress) / 100;

  if (!contactLoaded) return null;

  if (showContactForm) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#1a0000" }}>
        <div className="w-full max-w-xs space-y-4">
          <h2 className="text-white font-bold text-lg text-center">
            {contact ? "Edit Trusted Contact" : "Add a Trusted Contact"}
          </h2>
          <p className="text-sm text-center" style={{ color: "#ff9999" }}>
            This is who the panic button messages when you hold it. Stored on this device only.
          </p>
          <div>
            <label className="block text-sm mb-1" style={{ color: "#ff9999" }}>
              Name
            </label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Mom, Thandi..."
              className="min-h-[48px] bg-white/5 text-white border-white/20"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: "#ff9999" }}>
              Phone Number
            </label>
            <Input
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="e.g. +27821234567"
              type="tel"
              className="min-h-[48px] bg-white/5 text-white border-white/20"
            />
          </div>
          <div className="flex gap-2">
            {contact && (
              <Button
                variant="outline"
                className="min-h-[48px] flex-1 border-white/20 text-white hover:bg-white/10"
                onClick={() => setShowContactForm(false)}
              >
                Cancel
              </Button>
            )}
            <Button
              className="min-h-[48px] flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSaveContact}
              disabled={!formName.trim() || !formPhone.trim()}
            >
              Save Contact
            </Button>
          </div>
          {!contact && (
            <button
              onClick={() => setShowContactForm(false)}
              className="w-full text-center text-xs underline min-h-[48px]"
              style={{ color: "#ff9999" }}
            >
              Skip for now — hold button will call the TEARS helpline instead
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "#1a0000" }}
    >
      {contact && (
        <button
          onClick={openEditContact}
          aria-label="Edit trusted contact"
          className="flex items-center gap-1.5 text-xs mb-6 min-h-[48px] px-3"
          style={{ color: "#ff9999" }}
        >
          <Pencil className="w-3.5 h-3.5" />
          Trusted contact: {contact.name}
        </button>
      )}

      {/* Hold button with progress ring */}
      <div className="relative flex items-center justify-center mb-4">
        <svg
          width="180"
          height="180"
          viewBox="0 0 100 100"
          className="absolute"
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#ff4444"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
          />
        </svg>
        <button
          ref={buttonRef}
          onPointerDown={handlePointerDown}
          onPointerUp={cancelHold}
          onPointerCancel={cancelHold}
          onPointerLeave={cancelHold}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          aria-label="Hold for 2 seconds to send an emergency alert with your location"
          className="w-40 h-40 rounded-full flex items-center justify-center select-none"
          style={{
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'none',
            userSelect: 'none',
            background: holding
              ? "radial-gradient(circle, #cc0000, #660000)"
              : "radial-gradient(circle, #990000, #440000)",
            boxShadow: holding
              ? "0 0 40px rgba(255,0,0,0.5)"
              : "0 0 20px rgba(255,0,0,0.2)",
          }}
        >
          <span
            className="text-white font-bold text-sm text-center leading-tight"
            style={{ userSelect: "none" }}
          >
            HOLD FOR
            <br />
            HELP
          </span>
        </button>
      </div>

      <p className="text-center text-sm max-w-[260px] mb-10" style={{ color: "#ff9999" }}>
        Hold 2 seconds — your SMS app will open ready to send your location
      </p>

      {/* Desktop/non-mobile fallback: sms:/tel: links don't do anything on most
          laptops, so surface the number and message as selectable/copyable text. */}
      {fallback && (
        <div className="w-full max-w-xs mb-6 rounded-lg p-4 space-y-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <p className="text-xs" style={{ color: "#ff9999" }}>
            This device may not have opened a messaging app automatically. Send this
            yourself instead:
          </p>
          {fallback.phone && (
            <p className="text-sm font-semibold text-white select-text break-all">{fallback.phone}</p>
          )}
          <p className="text-sm text-white select-text leading-relaxed">{fallback.message}</p>
          <div className="flex gap-2">
            <Button
              onClick={handleCopyMessage}
              variant="outline"
              className="min-h-[48px] flex-1 border-white/20 text-white hover:bg-white/10 flex items-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy Message"}
            </Button>
            <Button
              onClick={() => setFallback(null)}
              variant="outline"
              className="min-h-[48px] border-white/20 text-white hover:bg-white/10"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Helpline links */}
      <div className="w-full max-w-xs space-y-2">
        <a
          href="tel:0800150150"
          style={{
            display: "block",
            padding: "14px 0",
            color: "white",
            textDecoration: "none",
            fontSize: "18px",
            minHeight: "48px",
            textAlign: "center",
          }}
        >
          GBV Helpline: 0800 150 150
        </a>
        <a
          href="tel:10111"
          style={{
            display: "block",
            padding: "14px 0",
            color: "white",
            textDecoration: "none",
            fontSize: "18px",
            minHeight: "48px",
            textAlign: "center",
          }}
        >
          Police: 10111
        </a>
        <a
          href="tel:0800601010"
          style={{
            display: "block",
            padding: "14px 0",
            color: "white",
            textDecoration: "none",
            fontSize: "18px",
            minHeight: "48px",
            textAlign: "center",
          }}
        >
          TEARS: 0800 60 10 10
        </a>
      </div>
    </div>
  );
};

export default PanicButton;
