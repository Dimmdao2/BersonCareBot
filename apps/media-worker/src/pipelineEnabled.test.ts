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

  it("reads the global system_settings row only", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as import("pg").Pool;
    await readPipelineEnabled(pool);
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("organization_id IS NULL");
  });
});
