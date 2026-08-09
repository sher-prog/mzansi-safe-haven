import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import heroFood from "@/assets/hero-food.jpg";
import { Clock, Users, ChefHat, Plus, X } from "lucide-react";
import { recipes as defaultRecipes } from "@/data/recipes";
import RecipeDetail from "@/components/RecipeDetail";
import type { Recipe } from "@/components/RecipeDetail";
import LoyaltyGate from "@/components/LoyaltyGate";
import ImportBackup from "@/components/ImportBackup";

const CUSTOM_RECIPES_KEY = "mzansi_recipes";
const LOGO_LONG_PRESS_MS = 600;

interface RecipeCoverProps {
  onUnlock: () => void;
}

interface CustomRecipe {
  title: string;
  ingredients: string;
  method: string;
}

const RecipeCover = ({ onUnlock }: RecipeCoverProps) => {
  const [selectedRecipe, setSelectedRecipe] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [showImportBackup, setShowImportBackup] = useState(false);
  const [formData, setFormData] = useState<CustomRecipe>({ title: "", ingredients: "", method: "" });
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>([]);

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
      if (stored) setCustomRecipes(JSON.parse(stored));
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

  const allRecipes: Recipe[] = [...defaultRecipes, ...customRecipes];

  const handleSave = () => {
    if (!formData.title.trim()) return;
    const newRecipe: Recipe = {
      title: formData.title,
      desc: "My custom recipe",
      time: "—",
      serves: "—",
      image: heroFood,
      ingredients: formData.ingredients.split("\n").filter(Boolean),
      method: formData.method.split("\n").filter(Boolean),
    };
    const updated = [...customRecipes, newRecipe];
    setCustomRecipes(updated);
    localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(updated));
    setFormData({ title: "", ingredients: "", method: "" });
    setShowForm(false);
  };

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
        ) : selectedRecipe !== null ? (
          <RecipeDetail
            key="detail"
            recipe={allRecipes[selectedRecipe]}
            onBack={() => setSelectedRecipe(null)}
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
                  <ChefHat className="w-7 h-7 text-primary" />
                  <span className="font-display text-xl font-bold text-foreground">
                    Mzansi's Kitchen
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1 text-sm text-primary font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Recipe
                  </button>
                  <span className="text-xs text-muted-foreground">🇿🇦</span>
                  <div
                    onClick={handleSaltTap}
                    role="presentation"
                    aria-hidden="true"
                    className="opacity-30 select-none flex items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      cursor: "default",
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>🧂</span>
                  </div>
                </div>
              </div>
            </header>

            {/* Hero */}
            <div className="relative overflow-hidden">
              <img
                src={heroFood}
                alt="South African feast"
                className="w-full h-56 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  Today's Favourites
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Traditional South African recipes for the family
                </p>
              </div>
            </div>

            {/* Recipe Cards */}
            <div className="px-5 py-6 space-y-4">
              {allRecipes.map((recipe, i) => (
                <motion.button
                  key={`${recipe.title}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * Math.min(i, 5) }}
                  onClick={() => setSelectedRecipe(i)}
                  className="w-full flex gap-4 bg-card rounded-lg overflow-hidden shadow-sm border border-border text-left relative"
                >
                  <img
                    src={recipe.image}
                    alt={recipe.title}
                    className="w-28 h-28 object-cover flex-shrink-0"
                  />
                  <div className="py-3 pr-3 flex flex-col justify-center flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      {recipe.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {recipe.desc}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {recipe.time}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {recipe.serves}
                      </span>
                    </div>
                  </div>
                </motion.button>
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
              className="w-full max-w-md bg-card border-t border-border rounded-t-2xl p-5 pb-8 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-foreground">Add Recipe</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                value={formData.title}
                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                placeholder="Recipe Name"
                className="w-full px-4 py-3 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <textarea
                value={formData.ingredients}
                onChange={(e) => setFormData((f) => ({ ...f, ingredients: e.target.value }))}
                placeholder="Ingredients (one per line)"
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <textarea
                value={formData.method}
                onChange={(e) => setFormData((f) => ({ ...f, method: e.target.value }))}
                placeholder="Method (one step per line)"
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <button
                onClick={handleSave}
                disabled={!formData.title.trim()}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40"
              >
                Save Recipe
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RecipeCover;
