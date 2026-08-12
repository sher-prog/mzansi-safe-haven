import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import heroFood from "@/assets/hero-food.webp";
import { Clock, Users, ChefHat, Plus, X, Pencil } from "lucide-react";
import { recipes as defaultRecipes } from "@/data/recipes";
import { recipeCoverOptions, DEFAULT_COVER_ID, isKnownCoverId, resolveCoverImage } from "@/data/recipeCovers";
import RecipeDetail from "@/components/RecipeDetail";
import type { Recipe } from "@/components/RecipeDetail";
import LoyaltyGate from "@/components/LoyaltyGate";
import ImportBackup from "@/components/ImportBackup";
import LanguagePicker from "@/components/LanguagePicker";
import { useTranslation } from "@/i18n";

const CUSTOM_RECIPES_KEY = "mzansi_recipes";
const LOGO_LONG_PRESS_MS = 600;

interface RecipeCoverProps {
  onUnlock: () => void;
}

interface RecipeFormData {
  title: string;
  desc: string;
  time: string;
  serves: string;
  ingredients: string;
  method: string;
  coverId: string;
}

const emptyFormData: RecipeFormData = {
  title: "",
  desc: "",
  time: "",
  serves: "",
  ingredients: "",
  method: "",
  coverId: DEFAULT_COVER_ID,
};

// What actually gets persisted to localStorage for a user-added recipe. Deliberately
// has no `image` field: only `coverId`, a reference into recipeCoverOptions — the
// actual asset is attached at read time (see allRecipes below) rather than round-
// tripped through JSON, so recipe.image is always a literal import identifier, never
// a value that came back out of JSON.parse of arbitrary (if locally-sourced) storage.
interface StoredCustomRecipe {
  id: string;
  title: string;
  desc: string;
  time: string;
  serves: string;
  ingredients: string[];
  method: string[];
  coverId: string;
}

// The TypeScript annotation on JSON.parse's result is a compile-time assertion only —
// it doesn't check anything at runtime. Since localStorage content isn't guaranteed to
// match StoredCustomRecipe's shape (a stale format from a previous version, a manual
// edit, anything), verify it explicitly before trusting it rather than casting blind.
// coverId in particular must be a known id from recipeCoverOptions — an unrecognized
// or malformed id is rejected here rather than trusted further down the pipeline.
function isStoredCustomRecipe(value: unknown): value is StoredCustomRecipe {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.title === "string" &&
    typeof r.desc === "string" &&
    typeof r.time === "string" &&
    typeof r.serves === "string" &&
    isKnownCoverId(r.coverId) &&
    Array.isArray(r.ingredients) &&
    r.ingredients.every((item) => typeof item === "string") &&
    Array.isArray(r.method) &&
    r.method.every((item) => typeof item === "string")
  );
}

const RecipeCover = ({ onUnlock }: RecipeCoverProps) => {
  const { t } = useTranslation();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [showImportBackup, setShowImportBackup] = useState(false);
  const [formData, setFormData] = useState<RecipeFormData>(emptyFormData);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [customRecipes, setCustomRecipes] = useState<StoredCustomRecipe[]>([]);

  // Salt shaker tap tracking
  const tapCount = useRef(0);
  const lastTap = useRef(0);

  // ChefHat logo long-press — restores an encrypted backup (src/lib/backup.ts),
  // the offline replacement for the cloud sync removed in Phase 1. Pointer events
  // unify mouse/touch/pen into one stream, instead of parallel touch*/mouse*
  // listeners that could both fire for the same physical press.
  const logoPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoPressStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (logoPressTimer.current) clearTimeout(logoPressTimer.current);
    logoPressTimer.current = setTimeout(() => {
      logoPressTimer.current = null;
      setShowImportBackup(true);
    }, LOGO_LONG_PRESS_MS);
  }, []);

  const handleLogoPressEnd = useCallback(() => {
    if (logoPressTimer.current) {
      clearTimeout(logoPressTimer.current);
      logoPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_RECIPES_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setCustomRecipes(parsed.filter(isStoredCustomRecipe));
      }
    } catch {
      // Malformed local recipe data — ignore and start fresh.
    }
  }, []);

  const handleSaltTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current > 1500) {
      tapCount.current = 1;
    } else {
      tapCount.current += 1;
    }
    lastTap.current = now;

    if (tapCount.current >= 3) {
      tapCount.current = 0;
      setShowGate(true);
    }
  }, []);

  // Built field-by-field (no ...recipe spread) so there's no syntactic path from the
  // JSON.parse-sourced customRecipes entries to the `image` field below — every field
  // here is either named explicitly off a known-shape object or resolveCoverImage's
  // return value, which is always one of the literal imports in recipeCovers.ts.
  const allRecipes: Recipe[] = [
    ...defaultRecipes,
    ...customRecipes.map((recipe) => ({
      id: recipe.id,
      isDefault: false,
      title: recipe.title,
      desc: recipe.desc,
      time: recipe.time,
      serves: recipe.serves,
      ingredients: recipe.ingredients,
      method: recipe.method,
      image: resolveCoverImage(recipe.coverId),
    })),
  ];

  const selectedRecipe = selectedRecipeId ? (allRecipes.find((r) => r.id === selectedRecipeId) ?? null) : null;

  const persistCustomRecipes = (updated: StoredCustomRecipe[]) => {
    setCustomRecipes(updated);
    localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(updated));
  };

  const openAddForm = useCallback(() => {
    setFormData(emptyFormData);
    setEditingRecipeId(null);
    setShowForm(true);
  }, []);

  const openEditForm = useCallback(
    (id: string) => {
      const target = customRecipes.find((r) => r.id === id);
      if (!target) return;
      setFormData({
        title: target.title,
        desc: target.desc,
        time: target.time,
        serves: target.serves,
        ingredients: target.ingredients.join("\n"),
        method: target.method.join("\n"),
        coverId: target.coverId,
      });
      setEditingRecipeId(id);
      setShowForm(true);
    },
    [customRecipes],
  );

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingRecipeId(null);
    setFormData(emptyFormData);
  }, []);

  const handleSaveRecipe = () => {
    if (!formData.title.trim()) return;
    const fields = {
      title: formData.title.trim(),
      desc: formData.desc.trim(),
      time: formData.time.trim() || "—",
      serves: formData.serves.trim() || "—",
      ingredients: formData.ingredients.split("\n").map((line) => line.trim()).filter(Boolean),
      method: formData.method.split("\n").map((line) => line.trim()).filter(Boolean),
      coverId: isKnownCoverId(formData.coverId) ? formData.coverId : DEFAULT_COVER_ID,
    };

    const updated = editingRecipeId
      ? customRecipes.map((r) => (r.id === editingRecipeId ? { ...fields, id: editingRecipeId } : r))
      : [...customRecipes, { ...fields, id: crypto.randomUUID() }];

    persistCustomRecipes(updated);
    closeForm();
  };

  const handleDeleteRecipe = useCallback(
    (id: string) => {
      persistCustomRecipes(customRecipes.filter((r) => r.id !== id));
      if (selectedRecipeId === id) setSelectedRecipeId(null);
    },
    [customRecipes, selectedRecipeId],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-background"
    >
      <AnimatePresence mode="wait">
        {showImportBackup ? (
          <ImportBackup key="import-backup" onSuccess={onUnlock} onBack={() => setShowImportBackup(false)} />
        ) : showGate ? (
          <LoyaltyGate key="gate" onSuccess={onUnlock} onBack={() => setShowGate(false)} />
        ) : selectedRecipe ? (
          <RecipeDetail
            key="detail"
            recipe={selectedRecipe}
            onBack={() => setSelectedRecipeId(null)}
            onEdit={selectedRecipe.isDefault ? undefined : () => openEditForm(selectedRecipe.id)}
            onDelete={selectedRecipe.isDefault ? undefined : () => handleDeleteRecipe(selectedRecipe.id)}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
              <div className="flex items-center justify-between px-5 py-4">
                <div
                  className="flex items-center gap-2 select-none"
                  onPointerDown={handleLogoPressStart}
                  onPointerUp={handleLogoPressEnd}
                  onPointerCancel={handleLogoPressEnd}
                  onPointerLeave={handleLogoPressEnd}
                  style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
                >
                  <ChefHat className="w-7 h-7 text-primary" aria-hidden="true" />
                  <span className="font-display text-xl font-bold text-foreground">
                    {t("recipeCover.appName")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <LanguagePicker />
                  <button
                    onClick={openAddForm}
                    className="flex items-center gap-1 text-sm text-primary font-medium min-h-[44px] px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    {t("recipeCover.addRecipe")}
                  </button>
                  <span className="text-xs text-muted-foreground" aria-hidden="true">🇿🇦</span>
                  <div
                    onClick={handleSaltTap}
                    role="presentation"
                    aria-hidden="true"
                    className="opacity-30 select-none no-callout flex items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      cursor: "default",
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      WebkitTouchCallout: "none",
                    }}
                  >
                    <span className="select-none no-callout" style={{ fontSize: 16, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}>
                      🧂
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {/* Hero */}
            <div className="relative overflow-hidden">
              <img
                src={heroFood}
                alt={t("recipeCover.heroAlt")}
                className="w-full h-56 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  {t("recipeCover.heroTitle")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("recipeCover.heroSubtitle")}
                </p>
              </div>
            </div>

            {/* Recipe Cards */}
            <div className="px-5 py-6 space-y-4">
              {allRecipes.map((recipe, i) => (
                <motion.div
                  key={recipe.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * Math.min(i, 5) }}
                  className="relative w-full flex gap-4 bg-card rounded-lg overflow-hidden shadow-sm border border-border"
                >
                  <button
                    onClick={() => setSelectedRecipeId(recipe.id)}
                    className="flex gap-4 flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                  >
                    <img
                      src={recipe.image}
                      alt={recipe.title}
                      className="w-28 h-28 object-cover flex-shrink-0"
                    />
                    <div className="py-3 pr-3 flex flex-col justify-center flex-1 min-w-0">
                      <h3 className="font-display text-lg font-semibold text-foreground truncate">
                        {recipe.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {recipe.desc}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" /> {recipe.time}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" aria-hidden="true" /> {recipe.serves}
                        </span>
                      </div>
                    </div>
                  </button>
                  {!recipe.isDefault && (
                    <button
                      onClick={() => openEditForm(recipe.id)}
                      aria-label={t("recipeCover.editRecipeLabel")}
                      className="absolute top-2 right-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full bg-background/80 backdrop-blur-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Recipe Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end justify-center"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-card border-t border-border rounded-t-2xl p-5 pb-8 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-foreground">
                  {t(editingRecipeId ? "recipeCover.addRecipeModal.editTitle" : "recipeCover.addRecipeModal.title")}
                </h2>
                <button
                  onClick={closeForm}
                  aria-label={t("recipeCover.addRecipeModal.closeLabel")}
                  className="text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <input
                value={formData.title}
                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("recipeCover.addRecipeModal.namePlaceholder")}
                className="w-full px-4 py-3 min-h-[48px] rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <textarea
                value={formData.desc}
                onChange={(e) => setFormData((f) => ({ ...f, desc: e.target.value }))}
                placeholder={t("recipeCover.addRecipeModal.descPlaceholder")}
                rows={2}
                className="w-full px-4 py-3 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <div className="flex gap-3">
                <input
                  value={formData.time}
                  onChange={(e) => setFormData((f) => ({ ...f, time: e.target.value }))}
                  placeholder={t("recipeCover.addRecipeModal.timePlaceholder")}
                  className="w-full px-4 py-3 min-h-[48px] rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  value={formData.serves}
                  onChange={(e) => setFormData((f) => ({ ...f, serves: e.target.value }))}
                  placeholder={t("recipeCover.addRecipeModal.servesPlaceholder")}
                  className="w-full px-4 py-3 min-h-[48px] rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <p className="text-sm mb-2 text-foreground">{t("recipeCover.addRecipeModal.coverLabel")}</p>
                <div className="grid grid-cols-4 gap-2">
                  {recipeCoverOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, coverId: option.id }))}
                      aria-label={t(option.labelKey)}
                      aria-pressed={formData.coverId === option.id}
                      className={`relative rounded-lg overflow-hidden aspect-square border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        formData.coverId === option.id ? "border-primary" : "border-transparent"
                      }`}
                    >
                      <img src={option.image} alt={t(option.labelKey)} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={formData.ingredients}
                onChange={(e) => setFormData((f) => ({ ...f, ingredients: e.target.value }))}
                placeholder={t("recipeCover.addRecipeModal.ingredientsPlaceholder")}
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <textarea
                value={formData.method}
                onChange={(e) => setFormData((f) => ({ ...f, method: e.target.value }))}
                placeholder={t("recipeCover.addRecipeModal.methodPlaceholder")}
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <button
                onClick={handleSaveRecipe}
                disabled={!formData.title.trim()}
                className="w-full py-3 min-h-[48px] rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("recipeCover.addRecipeModal.save")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RecipeCover;
