import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimNextJob, reclaimStaleProcessing } from "./claim.js";

function createClientMock() {
  const query = vi.fn();
  return {
    query,
    release: vi.fn(),
  };
}

function createPoolMock(client: ReturnType<typeof createClientMock>) {
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(),
  };
}

describe("claimNextJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no pending jobs", async () => {
    const client = createClientMock();
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    const pool = createPoolMock(client);

    const job = await claimNextJob(pool as never, "worker-1");

    expect(job).toBeNull();
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("claims one pending job and increments attempts", async () => {
    const client = createClientMock();
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{
        id: "job-1",
        job_organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        media_organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "job-1",
          media_id: "media-1",
          organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          attempts: 2,
        }],
      })
      .mockResolvedValueOnce(undefined);
    const pool = createPoolMock(client);

    const job = await claimNextJob(pool as never, "worker-1");

    expect(job).toEqual({
      id: "job-1",
      mediaId: "media-1",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      attempts: 2,
    });
    const selectSql = String(client.query.mock.calls[1]?.[0] ?? "");
    expect(selectSql).toContain("LEFT JOIN media_files");
    expect(selectSql).toContain("FOR UPDATE OF j SKIP LOCKED");
    const updateSql = String(client.query.mock.calls[2]?.[0] ?? "");
    expect(updateSql).not.toContain("COALESCE");
    expect(updateSql).not.toContain("organization_id =");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it.each([
    [null, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", null],
    ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  ])("quarantines invariant violations (%s, %s)", async (jobOrganizationId, mediaOrganizationId) => {
    const client = createClientMock();
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{
        id: "job-invalid-org",
        job_organization_id: jobOrganizationId,
        media_organization_id: mediaOrganizationId,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    const pool = createPoolMock(client);

    await expect(claimNextJob(pool as never, "worker-1")).resolves.toBeNull();
    const quarantineSql = String(client.query.mock.calls[2]?.[0] ?? "");
    expect(quarantineSql).toContain("status = 'failed'");
    expect(quarantineSql).toContain("organization_invariant_violation");
    expect(client.query.mock.calls[2]?.[1]).toEqual(["job-invalid-org", "worker-1"]);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.query.mock.calls.filter((call) => String(call[0]).includes("status = 'processing'"))).toHaveLength(0);
  });

  it("rolls back when concurrent worker claims the same row first", async () => {
    const client = createClientMock();
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{
        id: "job-race",
        job_organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        media_organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    const pool = createPoolMock(client);

    const job = await claimNextJob(pool as never, "worker-late");

    expect(job).toBeNull();
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});

describe("reclaimStaleProcessing", () => {
  it("returns reclaimed row count", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 3 }) };
    const log = { info: vi.fn() };

    const n = await reclaimStaleProcessing(pool as never, 15, log as never);

    expect(n).toBe(3);
    expect(String(pool.query.mock.calls[0]?.[0])).toContain("stale_lock_reclaimed");
  });
});
