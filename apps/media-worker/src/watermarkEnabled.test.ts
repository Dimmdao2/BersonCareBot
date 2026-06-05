import { describe, expect, it, vi } from "vitest";
import { readVideoWatermarkEnabled } from "./watermarkEnabled.js";

describe("readVideoWatermarkEnabled", () => {
  it("false when missing row", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as import("pg").Pool;
    await expect(readVideoWatermarkEnabled(pool)).resolves.toBe(false);
  });

  it("true when value_json.value is true", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ value_json: { value: true } }] }),
    } as unknown as import("pg").Pool;
    await expect(readVideoWatermarkEnabled(pool)).resolves.toBe(true);
  });

  it("false when value_json is invalid", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ value_json: { value: "yes" } }] }),
    } as unknown as import("pg").Pool;
    await expect(readVideoWatermarkEnabled(pool)).resolves.toBe(false);
  });
});
