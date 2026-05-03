import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import {
  CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  CLINICAL_ASSESSMENT_KIND_SEED_V1,
} from "./clinicalTestAssessmentKind";

describe("clinical assessment kind seed parity (D2)", () => {
  it("in-memory reference items match CLINICAL_ASSESSMENT_KIND_SEED_V1", async () => {
    const items = await inMemoryReferencesPort.listActiveItemsByCategoryCode(
      CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
    );
    const seedCodes = [...CLINICAL_ASSESSMENT_KIND_SEED_V1].map((x) => x.code).sort();
    const memCodes = items.map((i) => i.code).sort();
    expect(memCodes).toEqual(seedCodes);
    for (const s of CLINICAL_ASSESSMENT_KIND_SEED_V1) {
      const hit = items.find((i) => i.code === s.code);
      expect(hit?.title).toBe(s.title);
    }
  });

  it("migration 0038 SQL contains every seed code", () => {
    const sqlPath = join(process.cwd(), "db/drizzle-migrations/0038_clinical_assessment_kind_reference.sql");
    const sql = readFileSync(sqlPath, "utf8");
    for (const s of CLINICAL_ASSESSMENT_KIND_SEED_V1) {
      expect(sql).toContain(`'${s.code}'`);
    }
  });
});
