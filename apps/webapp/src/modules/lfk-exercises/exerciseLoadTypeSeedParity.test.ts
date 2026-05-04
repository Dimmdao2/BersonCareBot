import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import {
  EXERCISE_LOAD_TYPE_CATEGORY_CODE,
  EXERCISE_LOAD_TYPE_SEED_V1,
} from "./exerciseLoadTypeReference";

describe("exercise load type seed parity", () => {
  it("in-memory reference items match EXERCISE_LOAD_TYPE_SEED_V1", async () => {
    const items = await inMemoryReferencesPort.listActiveItemsByCategoryCode(
      EXERCISE_LOAD_TYPE_CATEGORY_CODE,
    );
    const seedCodes = [...EXERCISE_LOAD_TYPE_SEED_V1].map((x) => x.code).sort();
    const memCodes = items.map((i) => i.code).sort();
    expect(memCodes).toEqual(seedCodes);
    for (const s of EXERCISE_LOAD_TYPE_SEED_V1) {
      const hit = items.find((i) => i.code === s.code);
      expect(hit?.title).toBe(s.title);
      expect(hit?.sortOrder).toBe(s.sortOrder);
    }
  });

  it("SQL migration lists the same codes as EXERCISE_LOAD_TYPE_SEED_V1", async () => {
    const sqlPath = join(
      process.cwd(),
      "db/drizzle-migrations/0041_exercise_load_type_reference_align.sql",
    );
    const sql = await readFile(sqlPath, "utf8");
    for (const s of EXERCISE_LOAD_TYPE_SEED_V1) {
      expect(sql).toContain(`'${s.code}'`);
    }
  });
});
