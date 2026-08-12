import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import * as secureStorage from "@/lib/secureStorage";
import RecipeCover from "./RecipeCover";

const tapDigits = (digits: string) => {
  for (const d of digits) {
    fireEvent.pointerUp(screen.getByLabelText(`Digit ${d}`), { pointerType: "touch" });
  }
};

// The salt shaker is a small opacity-30 decoy element with no visible label — found
// by its emoji content, exactly as a user would tap it without any affordance hinting
// it's interactive. It's wired to onClick (not a custom pointer gesture), unlike the
// logo long-press below.
const tapSaltShaker = () => {
  fireEvent.click(screen.getByText("🧂"));
};

describe("RecipeCover: the hidden unlock gesture (decoy screen -> PIN -> decrypt)", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("looks like an ordinary recipe app and does nothing for 1-2 taps on the salt shaker", () => {
    render(<RecipeCover onUnlock={vi.fn()} />);

    expect(screen.getByText("Today's Favourites")).toBeInTheDocument();
    expect(screen.queryByText("Loyalty Code")).not.toBeInTheDocument();

    tapSaltShaker();
    tapSaltShaker();

    // Only two taps — the gate must not have appeared.
    expect(screen.queryByText("Choose Your Loyalty Code")).not.toBeInTheDocument();
    expect(screen.getByText("Today's Favourites")).toBeInTheDocument();
  });

  it("full flow: three taps reveal the PIN gate, and a correct PIN unlocks safety mode", async () => {
    await secureStorage.setupPin("1234");
    secureStorage.lock();
    const onUnlock = vi.fn();
    render(<RecipeCover onUnlock={onUnlock} />);

    tapSaltShaker();
    tapSaltShaker();
    tapSaltShaker();

    await screen.findByText("Loyalty Code");
    tapDigits("1234");
    fireEvent.click(screen.getByText("Redeem Code"));

    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
    expect(secureStorage.isUnlocked()).toBe(true);
  });

  it("tapping 'Back' on the PIN gate returns to the recipe list without unlocking", async () => {
    await secureStorage.setupPin("1234");
    secureStorage.lock();
    render(<RecipeCover onUnlock={vi.fn()} />);

    tapSaltShaker();
    tapSaltShaker();
    tapSaltShaker();
    await screen.findByText("Loyalty Code");

    fireEvent.click(screen.getByText("Back"));

    await screen.findByText("Today's Favourites");
    expect(secureStorage.isUnlocked()).toBe(false);
  });

  it("long-pressing the chef hat logo opens Restore a Backup, not the PIN gate", async () => {
    render(<RecipeCover onUnlock={vi.fn()} />);

    const logo = screen.getByText("Mzansi's Kitchen").parentElement!;
    fireEvent.pointerDown(logo, { pointerType: "touch" });
    // The long-press threshold is 600ms — wait past it in real time rather than fake
    // timers, which don't play well with Testing Library's own polling internals.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    expect(await screen.findByText("Restore a Backup")).toBeInTheDocument();
    expect(screen.queryByText("Choose Your Loyalty Code")).not.toBeInTheDocument();
  }, 10000);
});

const CUSTOM_RECIPES_KEY = "mzansi_recipes";

function seedCustomRecipes(recipes: unknown[]) {
  localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(recipes));
}

function readCustomRecipes(): Array<Record<string, unknown>> {
  return JSON.parse(localStorage.getItem(CUSTOM_RECIPES_KEY) ?? "[]");
}

describe("RecipeCover: custom recipe CRUD", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });

  it("creates a custom recipe through the form and persists the expected shape to localStorage", async () => {
    render(<RecipeCover onUnlock={vi.fn()} />);

    fireEvent.click(screen.getByText("Add Recipe"));

    fireEvent.change(screen.getByPlaceholderText("Recipe Name"), { target: { value: "Malva Pudding" } });
    fireEvent.change(screen.getByPlaceholderText("A short description of your recipe"), {
      target: { value: "A warm, syrupy South African dessert." },
    });
    fireEvent.change(screen.getByPlaceholderText("Time (optional), e.g. 45m"), { target: { value: "1h" } });
    fireEvent.change(screen.getByPlaceholderText("Serves (optional), e.g. 4"), { target: { value: "6" } });
    fireEvent.change(screen.getByPlaceholderText("Ingredients (one per line)"), {
      target: { value: "Flour\nApricot jam\nButter" },
    });
    fireEvent.change(screen.getByPlaceholderText("Method (one step per line)"), {
      target: { value: "Mix\nBake\nPour sauce" },
    });
    fireEvent.click(screen.getByLabelText("Dessert")); // recipe-3 cover option

    fireEvent.click(screen.getByText("Save Recipe"));

    await screen.findByText("Malva Pudding");

    const stored = readCustomRecipes();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: "Malva Pudding",
      desc: "A warm, syrupy South African dessert.",
      time: "1h",
      serves: "6",
      ingredients: ["Flour", "Apricot jam", "Butter"],
      method: ["Mix", "Bake", "Pour sauce"],
      coverId: "recipe-3",
    });
    expect(typeof stored[0].id).toBe("string");
    expect((stored[0].id as string).length).toBeGreaterThan(0);
  });

  it("leaves time/serves as em-dash when left blank, rather than requiring them", async () => {
    render(<RecipeCover onUnlock={vi.fn()} />);

    fireEvent.click(screen.getByText("Add Recipe"));
    fireEvent.change(screen.getByPlaceholderText("Recipe Name"), { target: { value: "Quick Snack" } });
    fireEvent.click(screen.getByText("Save Recipe"));

    await screen.findByText("Quick Snack");
    const stored = readCustomRecipes();
    expect(stored[0]).toMatchObject({ time: "—", serves: "—", coverId: "hero-food" });
  });

  it("edits an existing custom recipe in place, keeping the same id", async () => {
    seedCustomRecipes([
      {
        id: "fixed-id-1",
        title: "Original Title",
        desc: "Original desc",
        time: "20m",
        serves: "2",
        ingredients: ["a"],
        method: ["b"],
        coverId: "hero-food",
      },
    ]);

    render(<RecipeCover onUnlock={vi.fn()} />);
    await screen.findByText("Original Title");

    fireEvent.click(screen.getByLabelText("Edit recipe"));

    const titleInput = screen.getByPlaceholderText("Recipe Name") as HTMLInputElement;
    expect(titleInput.value).toBe("Original Title");

    fireEvent.change(titleInput, { target: { value: "Updated Title" } });
    fireEvent.click(screen.getByLabelText("Bread")); // switch cover to recipe-2
    fireEvent.click(screen.getByText("Save Recipe"));

    await screen.findByText("Updated Title");
    expect(screen.queryByText("Original Title")).not.toBeInTheDocument();

    const stored = readCustomRecipes();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: "fixed-id-1", title: "Updated Title", coverId: "recipe-2" });
  });

  it("deletes a custom recipe from its detail view, gated behind a confirm step", async () => {
    seedCustomRecipes([
      {
        id: "delete-me",
        title: "Delete Me",
        desc: "d",
        time: "10m",
        serves: "1",
        ingredients: ["x"],
        method: ["y"],
        coverId: "hero-food",
      },
    ]);

    render(<RecipeCover onUnlock={vi.fn()} />);
    fireEvent.click(await screen.findByText("Delete Me"));

    fireEvent.click(await screen.findByText("Delete recipe"));

    // Confirm step shown — not deleted yet.
    await screen.findByText("Delete this recipe? This can't be undone.");
    expect(readCustomRecipes()).toHaveLength(1);

    // Cancel backs out without deleting.
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Delete this recipe? This can't be undone.")).not.toBeInTheDocument();
    expect(readCustomRecipes()).toHaveLength(1);

    // Delete again, this time confirm.
    fireEvent.click(screen.getByText("Delete recipe"));
    await screen.findByText("Delete this recipe? This can't be undone.");
    fireEvent.click(screen.getByText("Delete"));

    await screen.findByText("Today's Favourites"); // back on the list
    expect(screen.queryByText("Delete Me")).not.toBeInTheDocument();
    expect(readCustomRecipes()).toHaveLength(0);
  });

  it("resolves a custom recipe by id after a different, earlier custom recipe is deleted (index-fragility fix)", async () => {
    seedCustomRecipes([
      {
        id: "id-alpha",
        title: "Recipe Alpha",
        desc: "Alpha desc",
        time: "10m",
        serves: "1",
        ingredients: ["a"],
        method: ["b"],
        coverId: "hero-food",
      },
      {
        id: "id-beta",
        title: "Recipe Beta",
        desc: "Beta desc",
        time: "20m",
        serves: "2",
        ingredients: ["c"],
        method: ["d"],
        coverId: "recipe-1",
      },
    ]);

    render(<RecipeCover onUnlock={vi.fn()} />);
    await screen.findByText("Recipe Alpha");
    await screen.findByText("Recipe Beta");

    // Beta resolves correctly before any mutation. "Beta desc" also appears in the
    // list card's own blurb, so wait for the detail-only back button, not the text,
    // to know navigation actually happened.
    fireEvent.click(screen.getByText("Recipe Beta"));
    await screen.findByLabelText("Back to recipes");
    expect(screen.getByText("Beta desc")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Back to recipes"));

    // Delete Alpha — the earlier custom recipe — which shifts Beta's array position.
    fireEvent.click(await screen.findByText("Recipe Alpha"));
    fireEvent.click(await screen.findByText("Delete recipe"));
    fireEvent.click(await screen.findByText("Delete"));

    await screen.findByText("Today's Favourites");
    expect(screen.queryByText("Recipe Alpha")).not.toBeInTheDocument();

    // Beta — now at a different array index than before the deletion — must still
    // resolve to itself by id, not to whatever now occupies its old numeric position.
    fireEvent.click(screen.getByText("Recipe Beta"));
    await screen.findByLabelText("Back to recipes");
    expect(screen.getByText("Beta desc")).toBeInTheDocument();

    const stored = readCustomRecipes();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("id-beta");
  });

  it("rejects a custom recipe entry with an unknown coverId, without dropping valid entries", async () => {
    seedCustomRecipes([
      {
        id: "good-id",
        title: "Good Recipe",
        desc: "d",
        time: "5m",
        serves: "1",
        ingredients: ["a"],
        method: ["b"],
        coverId: "recipe-1",
      },
      {
        id: "bad-id",
        title: "Malicious Recipe",
        desc: "d",
        time: "5m",
        serves: "1",
        ingredients: ["a"],
        method: ["b"],
        coverId: "javascript:alert(1)",
      },
    ]);

    render(<RecipeCover onUnlock={vi.fn()} />);

    await screen.findByText("Good Recipe");
    expect(screen.queryByText("Malicious Recipe")).not.toBeInTheDocument();
  });

  it("never shows edit/delete controls on default (bundled) recipes, even alongside custom ones", async () => {
    seedCustomRecipes([
      {
        id: "custom-1",
        title: "My Custom Recipe",
        desc: "d",
        time: "5m",
        serves: "1",
        ingredients: ["a"],
        method: ["b"],
        coverId: "hero-food",
      },
    ]);

    render(<RecipeCover onUnlock={vi.fn()} />);
    await screen.findByText("My Custom Recipe");

    // List: exactly one edit pencil (the custom recipe's) — none on the 4 defaults.
    expect(screen.getAllByLabelText("Edit recipe")).toHaveLength(1);

    // Detail view of a default recipe: no edit/delete affordance at all.
    fireEvent.click(screen.getByText("Bobotie"));
    await screen.findByText("Cape Malay spiced mince with egg custard topping");
    expect(screen.queryByText("Edit recipe")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete recipe")).not.toBeInTheDocument();
  });
});
