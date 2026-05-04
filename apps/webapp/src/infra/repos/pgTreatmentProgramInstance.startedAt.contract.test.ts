import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Stage A: repo maps `started_at` / guards overwrite without requiring `USE_REAL_DATABASE`. */
describe("pgTreatmentProgramInstance started_at contract", () => {
  it("keeps mapStage + first in_progress patch semantics in source", () => {
    const src = readFileSync(join(__dirname, "pgTreatmentProgramInstance.ts"), "utf8");
    expect(src).toContain("startedAt: row.startedAt ?? null");
    expect(src).toContain("startedAtForPatch");
    expect(src).toContain('patch.status === "in_progress" && !stRow.startedAt');
    expect(src).toContain("startedAtForPatch !== undefined ? { startedAt: startedAtForPatch }");
  });
});
