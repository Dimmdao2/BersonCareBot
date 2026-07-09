import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pgPatientClinical principal transaction invariants", () => {
  it("clinical write methods use the webapp transaction chokepoint", () => {
    const src = readFileSync(new URL("./pgPatientClinical.ts", import.meta.url), "utf8");

    expect(src).toContain("runWebappTransaction");
    expect(src.match(/runWebappTransaction/g)?.length ?? 0).toBeGreaterThanOrEqual(9);
    expect(src).not.toContain("db.transaction");
  });
});
