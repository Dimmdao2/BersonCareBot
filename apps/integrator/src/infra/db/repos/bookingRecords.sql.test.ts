import { describe, expect, it, vi } from "vitest";
import type { DbPort } from "../../../kernel/contracts/index.js";
import { upsertRecord } from "./bookingRecords.js";

describe("bookingRecords upsertRecord SQL (Stage 3 timestamptz)", () => {
  it("casts record_at parameter as timestamptz in INSERT", async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      queries.push(sql);
      return { rows: [] };
    }) as DbPort["query"];
    const db: DbPort = {
      query,
      tx: async <T>(fn: (inner: DbPort) => Promise<T>) => fn(db),
    };
    await upsertRecord(db, {
      externalRecordId: "ext-1",
      phoneNormalized: "+79990001122",
      recordAt: "2026-04-07T08:00:00.000Z",
      status: "updated",
      payloadJson: {},
      lastEvent: "updated",
    });
    expect(queries.some((s) => s.includes("$3::timestamptz"))).toBe(true);
  });
});
