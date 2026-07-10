/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import {
  loadAdminMediaPreviewGroupedCounts,
  loadAdminMediaPreviewStalePendingCount,
} from "./pgAdminMediaPreviewHealth";

describe("pgAdminMediaPreviewHealth", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("loads grouped preview counts for configured mime types", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ mime_type: "image/heic", preview_status: "ready", cnt: "2" }],
    });

    await expect(loadAdminMediaPreviewGroupedCounts(["image/heic"])).resolves.toEqual([
      { mime_type: "image/heic", preview_status: "ready", cnt: "2" },
    ]);

    const [sql, params] = runWebappPgTextMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM media_files");
    expect(sql).toContain("GROUP BY mime_type, preview_status");
    expect(params).toEqual([["image/heic"]]);
  });

  it("parses stale pending count", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ stale_pending_count: "3" }] });

    await expect(loadAdminMediaPreviewStalePendingCount(["video/quicktime"], 30)).resolves.toBe(3);

    const [sql, params] = runWebappPgTextMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("preview_status = 'pending'");
    expect(sql).toContain("created_at < now()");
    expect(params).toEqual([["video/quicktime"], 30]);
  });
});
