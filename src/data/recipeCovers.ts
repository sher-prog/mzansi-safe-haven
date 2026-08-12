import heroFood from "@/assets/hero-food.webp";
import recipe1 from "@/assets/recipe-1.webp";
import recipe2 from "@/assets/recipe-2.webp";
import recipe3 from "@/assets/recipe-3.webp";

/**
 * Curated cover-photo picker for custom recipes — no file upload, no user-supplied
 * image data, ever. Each option is a bundled asset id'd by a fixed string; only that
 * id is ever persisted (see StoredCustomRecipe in RecipeCover.tsx), never image bytes
 * or a URL. Adding a new option later is one new entry here plus an asset import — no
 * logic elsewhere needs to change.
 */
export interface RecipeCoverOption {
  id: string;
  image: string;
  /** i18n key for a short label describing what the photo shows, to help the user
   * pick a cover that visually fits their recipe (not a category match by title). */
  labelKey: string;
}

export const recipeCoverOptions: RecipeCoverOption[] = [
  { id: "hero-food", image: heroFood, labelKey: "recipeCover.coverOptions.heroFood" },
  { id: "recipe-1", image: recipe1, labelKey: "recipeCover.coverOptions.recipe1" },
  { id: "recipe-2", image: recipe2, labelKey: "recipeCover.coverOptions.recipe2" },
  { id: "recipe-3", image: recipe3, labelKey: "recipeCover.coverOptions.recipe3" },
];

export const DEFAULT_COVER_ID = "hero-food";

export function isKnownCoverId(coverId: unknown): coverId is string {
  return typeof coverId === "string" && recipeCoverOptions.some((option) => option.id === coverId);
}

/** Looks up the trusted bundled asset for a cover id. Always returns one of the
 * literal imports above — falls back to heroFood for any id it doesn't recognize,
 * so this never becomes a pass-through for arbitrary stored strings. */
export function resolveCoverImage(coverId: string): string {
  return recipeCoverOptions.find((option) => option.id === coverId)?.image ?? heroFood;
}
