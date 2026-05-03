import { describe, expect, it, vi } from "vitest";
import { readPipelineEnabled } from "./pipelineEnabled.js";

describe("readPipelineEnabled", () => {
  it("false when missing row", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as import("pg").Pool;
    await expect(readPipelineEnabled(pool)).resolves.toBe(false);
  });

  it("true when value_json.value is true", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ value_json: { value: true } }] }),
    } as unknown as import("pg").Pool;
    await expect(readPipelineEnabled(pool)).resolves.toBe(true);
  });
});
