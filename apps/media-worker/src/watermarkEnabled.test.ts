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

  it("reads the global system_settings row only", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as import("pg").Pool;
    await readVideoWatermarkEnabled(pool);
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("organization_id IS NULL");
  });
});
