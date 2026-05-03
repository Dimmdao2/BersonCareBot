import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import {
  RECOMMENDATION_TYPE_CATEGORY_CODE,
  RECOMMENDATION_TYPE_SEED_V1,
} from "./recommendationDomain";

describe("recommendation type seed parity (D3)", () => {
  it("in-memory reference items match RECOMMENDATION_TYPE_SEED_V1", async () => {
    const items = await inMemoryReferencesPort.listActiveItemsByCategoryCode(
      RECOMMENDATION_TYPE_CATEGORY_CODE,
    );
    const seedCodes = [...RECOMMENDATION_TYPE_SEED_V1].map((x) => x.code).sort();
    const memCodes = items.map((i) => i.code).sort();
    expect(memCodes).toEqual(seedCodes);
    for (const s of RECOMMENDATION_TYPE_SEED_V1) {
      const hit = items.find((i) => i.code === s.code);
      expect(hit?.title).toBe(s.title);
      expect(hit?.sortOrder).toBe(s.sortOrder);
    }
  });

  it("SQL migration lists the same codes as RECOMMENDATION_TYPE_SEED_V1", async () => {
    const sqlPath = join(process.cwd(), "db/drizzle-migrations/0039_recommendation_type_reference.sql");
    const sql = await readFile(sqlPath, "utf8");
    for (const s of RECOMMENDATION_TYPE_SEED_V1) {
      expect(sql).toContain(`'${s.code}'`);
    }
  });
});
