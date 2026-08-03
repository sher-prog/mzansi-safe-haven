import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { toast } from "sonner";
import { getItem, setItem } from "@/lib/secureStorage";

const STORAGE_KEY = "checklist";

const defaultItems = [
  { id: "id", label: "ID document / passport copy", category: "Documents" },
  { id: "birth", label: "Children's birth certificates", category: "Documents" },
  { id: "protection", label: "Protection order copy", category: "Documents" },
  { id: "medical", label: "Medical records", category: "Documents" },
  { id: "cash", label: "Emergency cash hidden safely", category: "Essentials" },
  { id: "phone", label: "Prepaid phone or airtime", category: "Essentials" },
  { id: "keys", label: "Spare set of keys", category: "Essentials" },
  { id: "clothes", label: "Change of clothes (you + children)", category: "Essentials" },
  { id: "meds", label: "Medication / prescriptions", category: "Essentials" },
  { id: "contacts", label: "Trusted contact numbers memorised", category: "Safety" },
  { id: "route", label: "Exit route planned", category: "Safety" },
  { id: "signal", label: "Code word set with trusted person", category: "Safety" },
  { id: "shelter", label: "Shelter location identified", category: "Safety" },
];

const ExitPlanChecklist = () => {
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
        toast.error("Failed to save checklist. Storage may be full or locked.");
      }
    })();
  }, [checked, loaded]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categories = [...new Set(defaultItems.map((i) => i.category))];
  const progress = Math.round((checked.size / defaultItems.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Exit Plan Checklist
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Prepare these items in advance. Your progress is saved privately on this device.
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{checked.size} of {defaultItems.length} ready</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Items by category */}
      {categories.map((cat) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {cat}
          </h3>
          {defaultItems
            .filter((item) => item.category === cat)
            .map((item) => (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className="flex items-center gap-3 w-full text-left p-3 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
              >
                {checked.has(item.id) ? (
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    checked.has(item.id)
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
};

export default ExitPlanChecklist;
