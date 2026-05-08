import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createInMemoryPatientPracticeCompletionsPort,
  resetInMemoryPatientPracticeCompletionsForTests,
} from "./inMemoryPatientPracticeCompletions";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("pgPatientPracticeCompletions (runtime constraints)", () => {
  it("uses Drizzle only — no getPool / pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgPatientPracticeCompletions.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("getDrizzle");
  });
});

describe("warmupFeelingTrackingTx (runtime constraints)", () => {
  it("uses Drizzle tx.execute only — no getPool", () => {
    const src = readFileSync(join(__dirname, "warmupFeelingTrackingTx.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).toContain("execute");
  });
});

describe("patient practice completions port (in-memory harness)", () => {
  beforeEach(() => {
    resetInMemoryPatientPracticeCompletionsForTests();
  });

  it("record increments countToday for same calendar day in tz", async () => {
    const port = createInMemoryPatientPracticeCompletionsPort();
    const tz = "Europe/Moscow";
    await port.record({
      userId: "u1",
      contentPageId: "550e8400-e29b-41d4-a716-446655440001",
      source: "section_page",
      feeling: null,
    });
    await port.record({
      userId: "u1",
      contentPageId: "550e8400-e29b-41d4-a716-446655440002",
      source: "section_page",
      feeling: 3,
    });
    expect(await port.countToday("u1", tz)).toBe(2);
    expect(await port.countToday("other", tz)).toBe(0);
  });

  it("streak uses streakLogic over distinct local dates", async () => {
    const port = createInMemoryPatientPracticeCompletionsPort();
    const tz = "UTC";
    await port.record({
      userId: "u1",
      contentPageId: "550e8400-e29b-41d4-a716-446655440001",
      source: "home",
      feeling: null,
    });
    const s = await port.streak("u1", tz);
    expect(s).toBeGreaterThanOrEqual(1);
  });

  it("getByIdForUser returns row only for matching user", async () => {
    const port = createInMemoryPatientPracticeCompletionsPort();
    const { id } = await port.record({
      userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      contentPageId: "550e8400-e29b-41d4-a716-446655440010",
      source: "daily_warmup",
      feeling: null,
    });
    const own = await port.getByIdForUser(id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(own?.id).toBe(id);
    const foreign = await port.getByIdForUser(id, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(foreign).toBeNull();
  });

  it("updateFeelingById updates only matching completion", async () => {
    const port = createInMemoryPatientPracticeCompletionsPort();
    const { id } = await port.record({
      userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      contentPageId: "550e8400-e29b-41d4-a716-446655440011",
      source: "daily_warmup",
      feeling: null,
    });
    const ok = await port.updateFeelingById(id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", 3);
    expect(ok).toBe(true);
    const row = await port.getByIdForUser(id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(row?.feeling).toBe(3);
    const badUser = await port.updateFeelingById(id, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", 5);
    expect(badUser).toBe(false);
  });
});
