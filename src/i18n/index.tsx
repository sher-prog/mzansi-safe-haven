import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import en from "./locales/en";
import zu from "./locales/zu";
import xh from "./locales/xh";
import af from "./locales/af";

/**
 * Hand-rolled, lightweight i18n instead of react-i18next: this app only needs flat
 * key lookup + {{var}} interpolation across four static locales, no pluralization
 * rules, no dynamic namespace loading — react-i18next + i18next add real weight
 * (~20KB+ min+gzip) for functionality this app never uses, which matters a lot on
 * the low-end, data-constrained phones this is built for.
 *
 * Each locale file is typed as `typeof en`, so a locale missing a key (or with an
 * extra/mistyped one) is a compile error — that's the completeness guarantee, in
 * place of a runtime-only i18n framework's fallback-and-warn behavior.
 */

export type Language = "en" | "zu" | "xh" | "af";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zu", label: "isiZulu" },
  { code: "xh", label: "isiXhosa" },
  { code: "af", label: "Afrikaans" },
];

const locales: Record<Language, typeof en> = { en, zu, xh, af };

const STORAGE_KEY = "safeexit_lang";

function resolveKey(dict: typeof en, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = dict;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

function isSupportedLanguage(value: string): value is Language {
  return value === "en" || value === "zu" || value === "xh" || value === "af";
}

function detectInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLanguage(stored)) return stored;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through to default.
  }
  const browserLang = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return isSupportedLanguage(browserLang) ? browserLang : "en";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Falls back to the English string, then the raw key, if a translation is missing. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // best-effort persistence only — a failed write shouldn't block switching language
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = locales[language];
      const value = resolveKey(dict, key) ?? resolveKey(en, key) ?? key;
      return interpolate(value, vars);
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within a LanguageProvider");
  return ctx;
}
