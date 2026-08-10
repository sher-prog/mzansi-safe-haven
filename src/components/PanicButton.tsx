import { useState, useEffect, useRef, useCallback } from "react";
import { Pencil, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getItem, setItem } from "@/lib/secureStorage";
import { beginHandoff } from "@/lib/appFocus";
import { useTranslation } from "@/i18n";

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
  const { t } = useTranslation();
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
      toast.success(t("panic.contactForm.saved"));
    } catch {
      toast.error(t("panic.contactForm.saveError"));
    }
  }, [formName, formPhone, t]);

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
        toast.error(t("panic.smsFailed"));
      }
      // sms: links silently do nothing on most desktops (and some Android devices with
      // no default SMS handler) — offer a copyable fallback there, without changing
      // anything about the mobile path above, which still gets attempted either way.
      if (!isLikelyMobileDevice()) {
        setFallback({ phone: contact.phone, message });
      }
    },
    [contact, t],
  );

  const triggerPanic = useCallback(() => {
    // Opening the SMS/tel app backgrounds the page — this is not the user leaving
    // the app, so don't let it exit safety mode and lock mid-emergency.
    beginHandoff();

    if (!contact) {
      toast.info(t("panic.noContactFallback"));
      window.location.href = TEARS_FALLBACK_TEL;
      if (!isLikelyMobileDevice()) {
        setFallback({ phone: null, message: t("panic.helplines.tearsFallbackMessage") });
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
  }, [contact, sendSMS, t]);

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
      toast.error(t("panic.desktopFallback.copyError"));
    }
  }, [fallback, t]);

  const dasharray = 283;
  const dashoffset = dasharray - (dasharray * progress) / 100;

  if (!contactLoaded) return null;

  if (showContactForm) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-safety-alert-bg">
        <div className="w-full max-w-xs space-y-4">
          <h2 className="text-safety-alert-foreground font-bold text-lg text-center">
            {contact ? t("panic.contactForm.editTitle") : t("panic.contactForm.addTitle")}
          </h2>
          <p className="text-sm text-center text-safety-alert-foreground/80">{t("panic.contactForm.explanation")}</p>
          <div>
            <label htmlFor="panic-contact-name" className="block text-sm mb-1 text-safety-alert-foreground/80">
              {t("panic.contactForm.nameLabel")}
            </label>
            <Input
              id="panic-contact-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t("panic.contactForm.namePlaceholder")}
              className="min-h-[48px] bg-safety-alert-foreground/5 text-safety-alert-foreground border-safety-alert-foreground/20 placeholder:text-safety-alert-foreground/40"
            />
          </div>
          <div>
            <label htmlFor="panic-contact-phone" className="block text-sm mb-1 text-safety-alert-foreground/80">
              {t("panic.contactForm.phoneLabel")}
            </label>
            <Input
              id="panic-contact-phone"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder={t("panic.contactForm.phonePlaceholder")}
              type="tel"
              className="min-h-[48px] bg-safety-alert-foreground/5 text-safety-alert-foreground border-safety-alert-foreground/20 placeholder:text-safety-alert-foreground/40"
            />
          </div>
          <div className="flex gap-2">
            {contact && (
              <Button
                variant="outline"
                className="min-h-[48px] flex-1 border-safety-alert-foreground/20 text-safety-alert-foreground hover:bg-safety-alert-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground"
                onClick={() => setShowContactForm(false)}
              >
                {t("common.cancel")}
              </Button>
            )}
            <Button
              className="min-h-[48px] flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground"
              onClick={handleSaveContact}
              disabled={!formName.trim() || !formPhone.trim()}
            >
              {t("panic.contactForm.save")}
            </Button>
          </div>
          {!contact && (
            <button
              onClick={() => setShowContactForm(false)}
              className="w-full text-center text-xs underline min-h-[48px] text-safety-alert-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground rounded"
            >
              {t("panic.contactForm.skip")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-safety-alert-bg">
      {contact && (
        <button
          onClick={openEditContact}
          aria-label={t("panic.editContactLabel")}
          className="flex items-center gap-1.5 text-xs mb-6 min-h-[48px] px-3 text-safety-alert-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground rounded"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          {t("panic.trustedContact", { name: contact.name })}
        </button>
      )}

      {/* Hold button with progress ring */}
      <div className="relative flex items-center justify-center mb-4">
        <svg width="180" height="180" viewBox="0 0 100 100" className="absolute" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
          <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--safety-alert-foreground) / 0.15)" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="hsl(var(--safety-alert))"
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
          aria-label={t("panic.holdLabel")}
          className="w-40 h-40 rounded-full flex items-center justify-center select-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safety-alert-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-safety-alert-bg"
          style={{
            WebkitTapHighlightColor: "transparent",
            touchAction: "none",
            userSelect: "none",
            background: holding
              ? "radial-gradient(circle, hsl(var(--safety-alert)), hsl(var(--safety-alert-deep)))"
              : "radial-gradient(circle, hsl(var(--safety-alert) / 0.65), hsl(var(--safety-alert-deep)))",
            boxShadow: holding
              ? "0 0 40px hsl(var(--safety-alert) / 0.5)"
              : "0 0 20px hsl(var(--safety-alert) / 0.2)",
          }}
        >
          <span className="text-safety-alert-foreground font-bold text-sm text-center leading-tight select-none">
            {t("panic.holdButton")}
          </span>
        </button>
      </div>

      <p className="text-center text-sm max-w-[260px] mb-10 text-safety-alert-foreground/80">{t("panic.holdInstruction")}</p>

      {/* Desktop/non-mobile fallback: sms:/tel: links don't do anything on most
          laptops, so surface the number and message as selectable/copyable text. */}
      {fallback && (
        <div className="w-full max-w-xs mb-6 rounded-lg p-4 space-y-3 bg-safety-alert-foreground/5 border border-safety-alert-foreground/15">
          <p className="text-xs text-safety-alert-foreground/80">{t("panic.desktopFallback.explanation")}</p>
          {fallback.phone && (
            <p className="text-sm font-semibold text-safety-alert-foreground select-text break-all">{fallback.phone}</p>
          )}
          <p className="text-sm text-safety-alert-foreground select-text leading-relaxed">{fallback.message}</p>
          <div className="flex gap-2">
            <Button
              onClick={handleCopyMessage}
              variant="outline"
              className="min-h-[48px] flex-1 border-safety-alert-foreground/20 text-safety-alert-foreground hover:bg-safety-alert-foreground/10 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground"
            >
              {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              {copied ? t("panic.desktopFallback.copied") : t("panic.desktopFallback.copyMessage")}
            </Button>
            <Button
              onClick={() => setFallback(null)}
              variant="outline"
              className="min-h-[48px] border-safety-alert-foreground/20 text-safety-alert-foreground hover:bg-safety-alert-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground"
            >
              {t("panic.desktopFallback.dismiss")}
            </Button>
          </div>
        </div>
      )}

      {/* Helpline links */}
      <div className="w-full max-w-xs space-y-2">
        <a
          href="tel:0800150150"
          className="block text-center text-safety-alert-foreground no-underline text-lg min-h-[48px] py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground rounded"
        >
          {t("panic.helplines.gbv")}
        </a>
        <a
          href="tel:10111"
          className="block text-center text-safety-alert-foreground no-underline text-lg min-h-[48px] py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground rounded"
        >
          {t("panic.helplines.police")}
        </a>
        <a
          href="tel:0800601010"
          className="block text-center text-safety-alert-foreground no-underline text-lg min-h-[48px] py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-alert-foreground rounded"
        >
          {t("panic.helplines.tears")}
        </a>
      </div>
    </div>
  );
};

export default PanicButton;
