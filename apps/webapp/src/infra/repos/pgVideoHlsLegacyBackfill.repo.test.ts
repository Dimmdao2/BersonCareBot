/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import {
  createPgVideoHlsLegacyBackfillReadRepo,
} from "./pgVideoHlsLegacyBackfill";
import { MEDIA_READABLE_SQL_M } from "./mediaHlsLegacySqlFilters";

describe("createPgVideoHlsLegacyBackfillReadRepo", () => {
  it("fetches legacy HLS candidate batch with expected SQL and params", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "a", size_bytes: "100" }],
    });
    const pool = { query } as unknown as import("pg").Pool;

    const rows = await createPgVideoHlsLegacyBackfillReadRepo(pool).fetchBatch({
      batchSize: 5,
      cursorAfterMediaId: "00000000-0000-4000-8000-000000000001",
      cutoffCreatedBefore: new Date("2020-01-01T00:00:00.000Z"),
      includeFailed: true,
    });

    expect(rows).toEqual([{ id: "a", size_bytes: "100" }]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(
      expect.arrayContaining([
        "00000000-0000-4000-8000-000000000001",
        "2020-01-01T00:00:00.000Z",
        5,
      ]),
    );
    expect(sql).toContain(MEDIA_READABLE_SQL_M);
    expect(sql).toContain("media_transcode_jobs");
    expect(sql).toContain("video_processing_status = 'failed'");
  });

  it("loads histogram and failed reasons through the same repo", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "pending", count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ video_processing_error: "err", count: "1" }] });
    const pool = { query } as unknown as import("pg").Pool;
    const repo = createPgVideoHlsLegacyBackfillReadRepo(pool);

    await expect(repo.loadHistogram()).resolves.toEqual([{ status: "pending", count: "2" }]);
    await expect(repo.loadFailedReasons()).resolves.toEqual([
      { video_processing_error: "err", count: "1" },
    ]);

    const histogramSql = query.mock.calls[0]?.[0] as string;
    const failedSql = query.mock.calls[1]?.[0] as string;
    expect(histogramSql).toContain("GROUP BY 1");
    expect(failedSql).toContain("video_processing_status = 'failed'");
  });
});
