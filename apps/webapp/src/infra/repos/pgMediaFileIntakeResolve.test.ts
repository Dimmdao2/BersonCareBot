import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const runWebappSqlMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
}));

import { resolveMediaFileForLfkAttachment } from "./pgMediaFileIntakeResolve";

const mediaId = "a0000000-0000-4000-8000-000000000001";
const userId = "b0000000-0000-4000-8000-000000000002";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: mediaId,
    s3_key: "media/key/file.pdf",
    mime_type: "application/pdf",
    size_bytes: "2048",
    original_name: "file.pdf",
    status: "ready",
    uploaded_by: userId,
    ...overrides,
  };
}

describe("resolveMediaFileForLfkAttachment", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
  });

  it("returns resolved s3 key and metadata when file is owned and ready", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [row()] });
    const client = {} as PoolClient;
    const r = await resolveMediaFileForLfkAttachment(client, mediaId, userId);
    expect(r.mediaId).toBe(mediaId);
    expect(r.s3Key).toBe("media/key/file.pdf");
    expect(r.mimeType).toBe("application/pdf");
    expect(r.sizeBytes).toBe(2048);
    expect(r.originalName).toBe("file.pdf");
  });

  it("throws ATTACHMENT_FILE_INVALID when media row is missing", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [] });
    const client = {} as PoolClient;
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });

  it("throws ATTACHMENT_FILE_FORBIDDEN when uploaded_by does not match", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [row({ uploaded_by: "other-user-uuid-0000-0000-0000-000000000099" })],
    });
    const client = {} as PoolClient;
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_FORBIDDEN",
    });
  });

  it("throws ATTACHMENT_FILE_INVALID when status is pending", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [row({ status: "pending" })] });
    const client = {} as PoolClient;
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });

  it("throws ATTACHMENT_FILE_INVALID when status is deleting", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [row({ status: "deleting" })] });
    const client = {} as PoolClient;
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });

  it("throws ATTACHMENT_FILE_INVALID when status is pending_delete", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [row({ status: "pending_delete" })] });
    const client = {} as PoolClient;
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });

  it("throws ATTACHMENT_FILE_INVALID when s3_key is missing", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [row({ s3_key: null })] });
    const client = {} as PoolClient;
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });
});
