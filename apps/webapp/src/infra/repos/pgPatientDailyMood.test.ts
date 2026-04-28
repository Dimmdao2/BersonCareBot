import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createInMemoryPatientDailyMoodPort,
  resetInMemoryPatientDailyMoodForTests,
} from "./inMemoryPatientDailyMood";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("pgPatientDailyMood (runtime constraints)", () => {
  it("uses Drizzle only — no getPool / pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgPatientDailyMood.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("getDrizzle");
    expect(src).toContain("onConflictDoUpdate");
  });
});

describe("patient daily mood port (in-memory harness)", () => {
  beforeEach(() => {
    resetInMemoryPatientDailyMoodForTests();
  });

  it("upserts and overrides by user and moodDate", async () => {
    const port = createInMemoryPatientDailyMoodPort();
    await port.upsertForDate({ userId: "u1", moodDate: "2026-04-28", score: 2 });
    await port.upsertForDate({ userId: "u1", moodDate: "2026-04-28", score: 5 });
    await port.upsertForDate({ userId: "u2", moodDate: "2026-04-28", score: 3 });

    expect(await port.getForDate("u1", "2026-04-28")).toMatchObject({ score: 5 });
    expect(await port.getForDate("u2", "2026-04-28")).toMatchObject({ score: 3 });
    expect(await port.getForDate("u1", "2026-04-29")).toBeNull();
  });
});
