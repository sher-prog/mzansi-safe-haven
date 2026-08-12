import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Users, ChefHat, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";

export interface Recipe {
  /** Stable identity independent of array position — see RecipeCover.tsx for why
   * (mutating the list, e.g. via edit/delete, must never make the detail view show
   * the wrong item). Default recipes use a fixed id; custom ones a crypto.randomUUID(). */
  id: string;
  /** Bundled content is never editable or deletable — this is the single source of
   * truth the UI checks everywhere it needs to distinguish the two. */
  isDefault: boolean;
  title: string;
  desc: string;
  time: string;
  serves: string;
  image: string;
  ingredients: string[];
  method: string[];
}

interface RecipeDetailProps {
  recipe: Recipe;
  onBack: () => void;
  /** Omitted (or recipe.isDefault) hides the edit/delete affordances entirely —
   * bundled recipes never render them, regardless of what a caller passes. */
  onEdit?: () => void;
  onDelete?: () => void;
}

// Recipe content itself (titles, descriptions, ingredients, method steps) stays
// English-only in this phase — translating ~100 lines of cooking instructions across
// three languages is a large effort for cover-story flavour text, not the
// safety-critical UI. The chrome around it (labels below) is translated like
// everything else.
const RecipeDetail = ({ recipe, onBack, onEdit, onDelete }: RecipeDetailProps) => {
  const { t } = useTranslation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const showControls = !recipe.isDefault && (onEdit || onDelete);
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="min-h-screen bg-background"
    >
      {/* Hero image */}
      <div className="relative">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-64 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <button
          onClick={onBack}
          aria-label={t("recipeDetail.backLabel")}
          className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-full p-2 min-h-[48px] min-w-[48px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 -mt-8 relative z-10 pb-10">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {recipe.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{recipe.desc}</p>

        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" aria-hidden="true" /> {recipe.time}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" aria-hidden="true" /> {t("recipeDetail.serves", { count: recipe.serves })}
          </span>
        </div>

        {/* Edit/delete — custom recipes only, never rendered for bundled content */}
        {showControls && !confirmingDelete && (
          <div className="flex items-center gap-3 mt-4">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 text-sm text-primary font-medium min-h-[44px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
                {t("recipeCover.editRecipeLabel")}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 text-sm text-destructive font-medium min-h-[44px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive rounded"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                {t("recipeCover.deleteRecipeLabel")}
              </button>
            )}
          </div>
        )}
        {showControls && confirmingDelete && onDelete && (
          <div className="mt-4 flex items-center gap-2 text-sm bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            <span className="text-foreground flex-1">{t("recipeCover.deleteConfirm.message")}</span>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="min-h-[44px] px-3 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={onDelete}
              className="min-h-[44px] px-3 text-sm font-semibold text-destructive-foreground bg-destructive rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              {t("common.delete")}
            </button>
          </div>
        )}

        {/* Ingredients */}
        <div className="mt-6">
          <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-primary" aria-hidden="true" />
            {t("recipeDetail.ingredients")}
          </h2>
          <ul className="mt-3 space-y-2">
            {recipe.ingredients.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Method */}
        <div className="mt-6">
          <h2 className="font-display text-lg font-semibold text-foreground">
            {t("recipeDetail.method")}
          </h2>
          <ol className="mt-3 space-y-4">
            {recipe.method.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5" aria-hidden="true">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </motion.div>
  );
};

export default RecipeDetail;
