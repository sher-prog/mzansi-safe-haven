import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n";

/** Every component now calls useTranslation(), which throws outside a
 * LanguageProvider — this is a drop-in replacement for RTL's render that wraps it. */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: LanguageProvider, ...options });
}

export * from "@testing-library/react";
