import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { readServerRuntimeBoolean } from "./serverRuntimeConfig.js";

describe("readServerRuntimeBoolean", () => {
  it("fails closed for a missing or malformed runtime row", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ value_json: { value: "true" } }] });
    const pool = { query } as unknown as Pool;

    await expect(readServerRuntimeBoolean(pool, "video_hls_pipeline_enabled")).resolves.toBe(false);
    await expect(readServerRuntimeBoolean(pool, "video_watermark_enabled")).resolves.toBe(false);
  });

  it("accepts only an explicit boolean true envelope", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ value_json: { value: true } }] }),
    } as unknown as Pool;

    await expect(readServerRuntimeBoolean(pool, "video_hls_pipeline_enabled")).resolves.toBe(true);
  });
});
