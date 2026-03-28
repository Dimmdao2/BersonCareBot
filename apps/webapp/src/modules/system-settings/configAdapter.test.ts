import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB pool
vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
}));

import { getConfigValue, getConfigBool, invalidateConfigCache, invalidateConfigKey } from "./configAdapter";
import { getPool } from "@/infra/db/client";

describe("configAdapter", () => {
  beforeEach(() => {
    invalidateConfigCache();
    vi.clearAllMocks();
  });

  it("returns env fallback when DB has no row", async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigValue("integrator_api_url", "http://localhost:4200");
    expect(result).toBe("http://localhost:4200");
  });

  it("returns DB value over env fallback when DB has a non-empty value", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: "http://prod-integrator.example.com" } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigValue("integrator_api_url", "http://localhost:4200");
    expect(result).toBe("http://prod-integrator.example.com");
  });

  it("uses cache on second call within TTL", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: "http://cached-value.example.com" } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    await getConfigValue("integrator_api_url", "fallback");
    await getConfigValue("integrator_api_url", "fallback");

    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it("invalidateConfigKey clears only the specified key cache", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: "some-value" } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    await getConfigValue("integrator_api_url", "fallback");
    await getConfigValue("booking_url", "fallback2");
    expect(mockPool.query).toHaveBeenCalledTimes(2);

    invalidateConfigKey("integrator_api_url");

    await getConfigValue("integrator_api_url", "fallback");
    await getConfigValue("booking_url", "fallback2"); // should use cache
    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });

  it("getConfigBool returns true for 'true' string", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: true } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigBool("google_calendar_enabled", false);
    expect(result).toBe(true);
  });

  it("getConfigBool returns env fallback false when DB empty", async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigBool("google_calendar_enabled", false);
    expect(result).toBe(false);
  });

  it("returns env fallback when DB throws an error", async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigValue("integrator_api_url", "http://fallback.example.com");
    expect(result).toBe("http://fallback.example.com");
  });
});
