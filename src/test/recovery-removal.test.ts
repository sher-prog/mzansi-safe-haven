import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

describe("cloud recovery-code removal", () => {
  it("no longer ships a Supabase client module", () => {
    expect(existsSync(resolve(root, "src/lib/supabase.ts"))).toBe(false);
  });

  it("no longer ships the word-based recovery code / cloud sync module", () => {
    expect(existsSync(resolve(root, "src/lib/recovery.ts"))).toBe(false);
  });

  it("package.json no longer depends on @supabase/supabase-js", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
    expect(pkg.dependencies ?? {}).not.toHaveProperty("@supabase/supabase-js");
    expect(pkg.devDependencies ?? {}).not.toHaveProperty("@supabase/supabase-js");
  });
});
