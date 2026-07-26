import { describe, expect, it } from "vitest";
import {
  mergeUndeliveredSupportSubmissions,
  parseUndeliveredSupportSubmissionsMeta,
} from "./undeliveredSupportSubmissions";

describe("undeliveredSupportSubmissions", () => {
  it("starts empty from null/undefined/garbage meta", () => {
    expect(parseUndeliveredSupportSubmissionsMeta(null)).toEqual({ items: [], total: 0 });
    expect(parseUndeliveredSupportSubmissionsMeta(undefined)).toEqual({ items: [], total: 0 });
    expect(parseUndeliveredSupportSubmissionsMeta("not an object")).toEqual({ items: [], total: 0 });
    expect(parseUndeliveredSupportSubmissionsMeta([1, 2, 3])).toEqual({ items: [], total: 0 });
  });

  it("prepends a new submission and bumps the monotonic total", () => {
    const merged = mergeUndeliveredSupportSubmissions(null, {
      at: "2026-07-26T10:00:00.000Z",
      kind: "patient",
      email: "a@b.co",
      message: "help",
      userId: "u1",
      fromPath: "/app/patient/support",
    });
    expect(merged.total).toBe(1);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]).toMatchObject({
      email: "a@b.co",
      message: "help",
      kind: "patient",
      userId: "u1",
      fromPath: "/app/patient/support",
    });
  });

  it("keeps the total growing even after the item list is trimmed", () => {
    let meta: unknown = null;
    for (let i = 0; i < 25; i++) {
      const merged = mergeUndeliveredSupportSubmissions(meta, {
        at: `2026-07-26T10:00:${String(i).padStart(2, "0")}.000Z`,
        kind: "guest",
        email: `g${i}@b.co`,
        message: `msg ${i}`,
      });
      meta = merged;
    }
    const final = parseUndeliveredSupportSubmissionsMeta(meta);
    expect(final.total).toBe(25);
    expect(final.items.length).toBeLessThanOrEqual(20);
    // most recent is first
    expect(final.items[0]?.email).toBe("g24@b.co");
  });

  it("clips an oversized message so a single row cannot grow unbounded", () => {
    const huge = "x".repeat(5000);
    const merged = mergeUndeliveredSupportSubmissions(null, {
      at: "2026-07-26T10:00:00.000Z",
      kind: "patient",
      email: "a@b.co",
      message: huge,
    });
    expect(merged.items[0]?.message.length).toBeLessThan(huge.length);
  });

  it("round-trips through parse after merge", () => {
    const merged = mergeUndeliveredSupportSubmissions(null, {
      at: "2026-07-26T10:00:00.000Z",
      kind: "guest",
      email: "g@b.co",
      message: "hello",
    });
    const parsed = parseUndeliveredSupportSubmissionsMeta(merged);
    expect(parsed).toEqual(merged);
  });

  it("ignores malformed entries in the stored items array instead of throwing", () => {
    const parsed = parseUndeliveredSupportSubmissionsMeta({
      items: [{ at: "2026-07-26T10:00:00.000Z", email: "ok@b.co", message: "fine" }, "garbage", 42, null],
      total: 4,
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.total).toBe(4);
  });
});
