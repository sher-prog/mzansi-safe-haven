import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { toast } from "sonner";
import { getItem, setItem } from "@/lib/secureStorage";
import { useTranslation } from "@/i18n";

const STORAGE_KEY = "checklist";

type Category = "Documents" | "Essentials" | "Safety";

// ids and categories are stable, untranslated keys used for storage/grouping —
// the displayed label/category name is looked up via t() at render time.
const defaultItems: { id: string; category: Category }[] = [
  { id: "id", category: "Documents" },
  { id: "birth", category: "Documents" },
  { id: "protection", category: "Documents" },
  { id: "medical", category: "Documents" },
  { id: "cash", category: "Essentials" },
  { id: "phone", category: "Essentials" },
  { id: "keys", category: "Essentials" },
  { id: "clothes", category: "Essentials" },
  { id: "meds", category: "Essentials" },
  { id: "contacts", category: "Safety" },
  { id: "route", category: "Safety" },
  { id: "signal", category: "Safety" },
  { id: "shelter", category: "Safety" },
];

const CATEGORIES: Category[] = ["Documents", "Essentials", "Safety"];

const ExitPlanChecklist = () => {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await getItem<string[]>(STORAGE_KEY);
        if (!cancelled && saved) setChecked(new Set(saved));
      } catch {
        // Locked or corrupted — start from an empty checklist rather than blocking the UI.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await setItem(STORAGE_KEY, [...checked]);
      } catch {
        toast.error(t("checklist.saveError"));
      }
    })();
  }, [checked, loaded, t]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const progress = Math.round((checked.size / defaultItems.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
          {t("checklist.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("checklist.subtitle")}</p>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t("checklist.readyCount", { checked: checked.size, total: defaultItems.length })}</span>
          <span>{progress}%</span>
        </div>
        <div
          className="h-2 bg-secondary rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Items by category */}
      {CATEGORIES.map((cat) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(`checklist.categories.${cat}`)}
          </h3>
          {defaultItems
            .filter((item) => item.category === cat)
            .map((item) => (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                aria-pressed={checked.has(item.id)}
                className="flex items-center gap-3 w-full min-h-[48px] text-left p-3 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {checked.has(item.id) ? (
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                )}
                <span
                  className={`text-sm ${
                    checked.has(item.id) ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {t(`checklist.items.${item.id}`)}
                </span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
};

export default ExitPlanChecklist;
