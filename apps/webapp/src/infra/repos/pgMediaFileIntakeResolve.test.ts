import { describe, it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
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

function mockClient(rows: unknown[]) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as PoolClient;
}

describe("resolveMediaFileForLfkAttachment", () => {
  it("returns resolved s3 key and metadata when file is owned and ready", async () => {
    const client = mockClient([row()]);
    const r = await resolveMediaFileForLfkAttachment(client, mediaId, userId);
    expect(r.mediaId).toBe(mediaId);
    expect(r.s3Key).toBe("media/key/file.pdf");
    expect(r.mimeType).toBe("application/pdf");
    expect(r.sizeBytes).toBe(2048);
    expect(r.originalName).toBe("file.pdf");
  });

  it("throws ATTACHMENT_FILE_INVALID when media row is missing", async () => {
    const client = mockClient([]);
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });

  it("throws ATTACHMENT_FILE_FORBIDDEN when uploaded_by does not match", async () => {
    const client = mockClient([row({ uploaded_by: "other-user-uuid-0000-0000-0000-000000000099" })]);
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_FORBIDDEN",
    });
  });

  it("throws ATTACHMENT_FILE_INVALID when status is pending", async () => {
    const client = mockClient([row({ status: "pending" })]);
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });

  it("throws ATTACHMENT_FILE_INVALID when status is deleting", async () => {
    const client = mockClient([row({ status: "deleting" })]);
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });

  it("throws ATTACHMENT_FILE_INVALID when s3_key is null", async () => {
    const client = mockClient([row({ s3_key: null })]);
    await expect(resolveMediaFileForLfkAttachment(client, mediaId, userId)).rejects.toMatchObject({
      code: "ATTACHMENT_FILE_INVALID",
    });
  });
});
