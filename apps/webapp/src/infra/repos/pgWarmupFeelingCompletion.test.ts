import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("pgWarmupFeelingCompletion (runtime constraints)", () => {
  it("uses Drizzle getDrizzle only — no getPool / pool.query", () => {
    const src = readFileSync(join(__dirname, "pgWarmupFeelingCompletion.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).toContain("getDrizzle");
  });
});
