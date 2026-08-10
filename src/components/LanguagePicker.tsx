import { Globe } from "lucide-react";
import { useTranslation, LANGUAGES, type Language } from "@/i18n";

/**
 * Lives in the recipe cover header, styled as an ordinary recipe-app feature (a
 * language switcher is exactly what a real recipe app would have) — it reinforces
 * the cover story rather than sitting oddly apart from it. Uses a native <select>
 * rather than the shadcn/Radix Select: that component is only otherwise used deep
 * inside the lazy-loaded safety toolkit, and pulling it into this always-loaded
 * header would drag its weight back into the initial bundle.
 */
const LanguagePicker = () => {
  const { language, setLanguage, t } = useTranslation();

  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Globe className="w-4 h-4" aria-hidden="true" />
      <label htmlFor="language-picker" className="sr-only">
        {t("language.picker")}
      </label>
      <select
        id="language-picker"
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        aria-label={t("language.picker")}
        className="bg-transparent text-xs font-medium text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-h-[44px] py-1"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguagePicker;
