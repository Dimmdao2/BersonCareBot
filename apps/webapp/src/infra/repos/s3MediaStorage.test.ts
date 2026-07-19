/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";
import { canAccessProgramSubmissionMedia } from "@/modules/media/programSubmissionPlaybackAccess";
import type { AppSession } from "@/shared/types/session";

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const insertValuesMock = vi.hoisted(() => vi.fn());
const connectQueryMock = vi.hoisted(() => vi.fn());
const s3PutObjectBodyMock = vi.hoisted(() => vi.fn());
const s3DeleteObjectMock = vi.hoisted(() => vi.fn());
const s3ListObjectKeysUnderPrefixMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipal: vi.fn(() => undefined),
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
  applyDbPrincipalToConnection: vi.fn().mockResolvedValue(false),
  applyDbPrincipalToTransaction: vi.fn().mockResolvedValue(false),
  applyCurrentDbPrincipalToConnection: vi.fn().mockResolvedValue(undefined),
  applyCurrentDbPrincipalToTransaction: vi.fn().mockResolvedValue(undefined),
  clearDbPrincipalFromConnection: vi.fn().mockResolvedValue(undefined),
  buildDbPrincipalApplyOptionsFromEnv: vi.fn(() => ({ mode: "legacy-guc" })),
  assertDbPrincipalRequestPoolCheckoutAllowed: vi.fn(),
  assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: vi.fn(() => ({
    insert: insertMock,
  })),
  getWebappSqlFromPgClient: vi.fn(() => ({ insert: insertMock })),
  runWebappSql: runWebappSqlMock,
  runWebappTransaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
}));

vi.mock("@/infra/db/pgAdvisoryLock", () => ({
  pgSessionAdvisoryLock: vi.fn().mockResolvedValue(undefined),
  pgSessionAdvisoryUnlock: vi.fn().mockResolvedValue(undefined),
  drizzleOnPgClient: vi.fn(() => ({})),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    connect: async () => ({
      query: (...args: unknown[]) => connectQueryMock(...args),
      release: () => {},
    }),
  }),
}));

vi.mock("@/infra/s3/client", async () => {
  const actual = await vi.importActual<typeof import("@/infra/s3/client")>("@/infra/s3/client");
  return {
    ...actual,
    s3PutObjectBody: (...args: unknown[]) => s3PutObjectBodyMock(...args),
    s3DeleteObject: (...args: unknown[]) => s3DeleteObjectMock(...args),
    s3ListObjectKeysUnderPrefix: (...args: unknown[]) => s3ListObjectKeysUnderPrefixMock(...args),
  };
});

vi.mock("@/config/env", () => ({
  env: {
    MEDIA_STORAGE_DIR: "",
    S3_ENDPOINT: "https://fs.test",
    S3_ACCESS_KEY: "k",
    S3_SECRET_KEY: "s",
    S3_PUBLIC_BUCKET: "b",
    S3_PRIVATE_BUCKET: "private-b",
    S3_REGION: "us-east-1",
    S3_FORCE_PATH_STYLE: true,
  },
}));

import {
  collectS3KeysForMediaPurge,
  createS3MediaStoragePort,
  getMediaAccessRow,
  getMediaRowForPlayback,
  insertPendingProgramSubmissionMediaFileTx,
  purgePendingMediaDeleteBatch,
} from "./s3MediaStorage";

function approxSqlAt(callIndex: number): string {
  const fragment = runWebappSqlMock.mock.calls[callIndex]?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

type TenantMediaFixture = {
  id: string;
  organizationId: string;
  usagePurpose: string | null;
  uploadedBy: string;
  originalName: string;
};

const TENANT_MEDIA_FIXTURES: TenantMediaFixture[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    organizationId: ORG_A,
    usagePurpose: null,
    uploadedBy: "aaaaaaaa-0000-4000-8000-000000000001",
    originalName: "alpha-a.png",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    organizationId: ORG_A,
    usagePurpose: "program_item_submission",
    uploadedBy: "aaaaaaaa-0000-4000-8000-000000000002",
    originalName: "submission-a.mp4",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    organizationId: ORG_B,
    usagePurpose: null,
    uploadedBy: "bbbbbbbb-0000-4000-8000-000000000001",
    originalName: "normal-b.png",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    organizationId: ORG_B,
    usagePurpose: "program_item_submission",
    uploadedBy: "bbbbbbbb-0000-4000-8000-000000000002",
    originalName: "alpha-b.mp4",
  },
];

function mediaSqlRow(row: TenantMediaFixture) {
  return {
    id: row.id,
    original_name: row.originalName,
    display_name: null,
    mime_type: row.originalName.endsWith(".mp4") ? "video/mp4" : "image/png",
    size_bytes: "100",
    uploaded_by: row.uploadedBy,
    uploaded_by_name: null,
    created_at: new Date("2026-07-19T00:00:00.000Z"),
    s3_key: `media/${row.id}/${row.originalName}`,
    stored_path: `media/${row.id}/${row.originalName}`,
    folder_id: null,
    preview_status: "ready",
    preview_sm_key: `preview/${row.id}/sm.jpg`,
    preview_md_key: `preview/${row.id}/md.jpg`,
    source_width: 640,
    source_height: 480,
    video_processing_status: "ready",
    video_processing_error: null,
    hls_master_playlist_s3_key: null,
    hls_artifact_prefix: null,
    poster_s3_key: null,
    video_duration_seconds: null,
    available_qualities_json: null,
    video_delivery_override: row.usagePurpose ? "mp4" : null,
    usage_purpose: row.usagePurpose,
  };
}

/**
 * Deterministic SQL adapter: it evaluates the organization predicate encoded by the
 * real Drizzle query against rows from both organizations. The old submission `OR`
 * bypass deliberately leaves foreign submission rows visible, so these tests fail
 * against the vulnerable query rather than merely asserting a source string.
 */
function installTenantMediaSqlAdapter(): void {
  runWebappSqlMock.mockImplementation((_db: unknown, fragment: unknown) => {
    const query = drizzleSqlFragmentToApproximateSql(fragment);
    const principalOrganizationId = [ORG_A, ORG_B].find((id) => query.includes(id));
    const hasSubmissionBypass = /program_item_submission[\s\S]*\bOR\b[\s\S]*organization_id/i.test(query);
    const hasExactOrganizationPredicate =
      principalOrganizationId !== undefined && /organization_id/i.test(query) && !hasSubmissionBypass;

    let rows = hasExactOrganizationPredicate
      ? TENANT_MEDIA_FIXTURES.filter((row) => row.organizationId === principalOrganizationId)
      : [...TENANT_MEDIA_FIXTURES];

    const requestedId = TENANT_MEDIA_FIXTURES.find((row) => query.includes(row.id))?.id;
    if (requestedId) rows = rows.filter((row) => row.id === requestedId);
    if (/alpha/i.test(query)) {
      rows = rows.filter((row) => row.originalName.toLowerCase().includes("alpha"));
    }
    if (/mime_type LIKE ['"]?video\/%/i.test(query)) {
      rows = rows.filter((row) => row.originalName.endsWith(".mp4"));
    }

    const mapped = rows.map(mediaSqlRow);
    if (/COUNT\(\*\) OVER/i.test(query)) {
      return Promise.resolve({
        rows: mapped.map((row) => ({ ...row, total_count: String(mapped.length) })),
      });
    }
    if (/SELECT\s+usage_purpose/i.test(query)) {
      return Promise.resolve({ rows: mapped });
    }
    if (/SELECT\s+id::text,\s*mime_type/i.test(query)) {
      return Promise.resolve({ rows: mapped });
    }
    if (/SELECT\s+m\.id,\s*m\.original_name/i.test(query)) {
      return Promise.resolve({ rows: mapped });
    }
    if (/SELECT\s+s3_key/i.test(query)) {
      return Promise.resolve({ rows: mapped });
    }
    throw new Error(`Unhandled tenant media SQL fixture query: ${query}`);
  });
}

function appSession(userId: string, role: AppSession["user"]["role"]): AppSession {
  return {
    user: { userId, role, displayName: "Fixture", bindings: {} },
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  };
}

describe("createS3MediaStoragePort", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    insertMock.mockReset();
    insertValuesMock.mockReset();
    connectQueryMock.mockReset();
    s3PutObjectBodyMock.mockReset();
    s3DeleteObjectMock.mockReset();
    s3ListObjectKeysUnderPrefixMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue("99999999-9999-4999-8999-999999999999");
    s3PutObjectBodyMock.mockResolvedValue(undefined);
    s3DeleteObjectMock.mockResolvedValue(undefined);
    s3ListObjectKeysUnderPrefixMock.mockResolvedValue([]);
    insertValuesMock.mockResolvedValue(undefined);
    insertMock.mockReturnValue({ values: insertValuesMock });
  });

  it("upload puts object to S3 and inserts ready row", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }] });

    const port = createS3MediaStoragePort();
    const body = new Uint8Array([9, 9, 9]).buffer;
    const result = await port.upload({
      body,
      filename: "pic.png",
      mimeType: "image/png",
      userId: "22222222-2222-4222-8222-222222222222",
    });

    expect(s3PutObjectBodyMock).toHaveBeenCalledWith(
      expect.stringMatching(/^media\/11111111-1111-4111-8111-111111111111\/pic\.png$/),
      expect.any(Buffer),
      "image/png",
    );
    expect(insertMock).toHaveBeenCalled();
    expect(result.record.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.url).toBe("/api/media/11111111-1111-4111-8111-111111111111");
  });

  it("getUrl returns app media path when s3_key is set", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [{ s3_key: "media/abc/file.png" }] });
    const port = createS3MediaStoragePort();
    const url = await port.getUrl("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(url).toBe("/api/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("getUrl returns null when no s3_key row", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    const url = await port.getUrl("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(url).toBeNull();
  });

  it("list without folder scope excludes client-files subtree", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    await port.list({ limit: 10, offset: 0 });
    const listSql = approxSqlAt(0);
    expect(listSql).toMatch(/client_tree/i);
    expect(listSql).toMatch(/client_files_root/i);
    expect(listSql).toContain("99999999-9999-4999-8999-999999999999");
    expect(listSql).not.toMatch(/program_item_submission[\s\S]*\bOR\b/i);
  });

  it("direct media metadata is organization-scoped before program-submission ACL", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [] });
    await expect(getMediaAccessRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toBeNull();
    const accessSql = approxSqlAt(0);
    expect(accessSql).toContain("99999999-9999-4999-8999-999999999999");
    expect(accessSql).not.toMatch(/program_item_submission[\s\S]*\bOR\b/i);
  });

  it("stamps the active organization on pending program-submission uploads", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);

    await insertPendingProgramSubmissionMediaFileTx({} as PoolClient, {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      filename: "submission.jpg",
      key: "media/submission.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 123,
      userId: "aaaaaaaa-0000-4000-8000-000000000002",
      folderId: "aaaaaaaa-ffff-4fff-8fff-ffffffffffff",
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        usagePurpose: "program_item_submission",
      }),
    );
  });

  it("evaluates organization A/B for list, total, search, picker and direct media reads", async () => {
    installTenantMediaSqlAdapter();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const port = createS3MediaStoragePort();

    const listA = await port.list({ limit: 20, offset: 0, excludeClientFiles: false });
    expect(listA.total).toBe(2);
    expect(listA.items.map((item) => item.id)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    ]);

    const searchA = await port.list({
      limit: 20,
      offset: 0,
      query: "alpha",
      excludeClientFiles: false,
    });
    expect(searchA.total).toBe(1);
    expect(searchA.items.map((item) => item.filename)).toEqual(["alpha-a.png"]);

    const pickerA = await port.list({
      limit: 20,
      offset: 0,
      kind: "video",
      excludeClientFiles: false,
    });
    expect(pickerA.total).toBe(1);
    expect(pickerA.items[0]?.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");

    await expect(port.getById("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1")).resolves.toBeNull();
    await expect(port.getUrl("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2")).resolves.toBeNull();
    await expect(getMediaRowForPlayback("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2")).resolves.toBeNull();

    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_B);
    await expect(getMediaAccessRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2")).resolves.toBeNull();
    await expect(getMediaRowForPlayback("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2")).resolves.toBeNull();
  });

  it("denies doctor B the org A submission while uploader A and staff A remain allowed", async () => {
    installTenantMediaSqlAdapter();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const submissionA = await getMediaAccessRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    expect(submissionA).not.toBeNull();
    expect(
      canAccessProgramSubmissionMedia(appSession(submissionA!.uploaded_by, "client"), {
        usagePurpose: submissionA!.usage_purpose,
        uploadedBy: submissionA!.uploaded_by,
      }),
    ).toBe(true);
    expect(
      canAccessProgramSubmissionMedia(appSession("aaaaaaaa-0000-4000-8000-000000000099", "doctor"), {
        usagePurpose: submissionA!.usage_purpose,
        uploadedBy: submissionA!.uploaded_by,
      }),
    ).toBe(true);

    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_B);
    const rowVisibleToDoctorB = await getMediaAccessRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    expect(rowVisibleToDoctorB).toBeNull();
  });

  it("updateDisplayName requires DB principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);
    const port = createS3MediaStoragePort();
    await expect(
      port.updateDisplayName("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Name"),
    ).rejects.toThrow("organization_principal_required");
    expect(runWebappSqlMock).not.toHaveBeenCalled();
  });

  it("updateDisplayName stamps and filters by organization principal", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const port = createS3MediaStoragePort();
    const ok = await port.updateDisplayName("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Name");
    expect(ok).toBe(true);
    const updateSql = approxSqlAt(0);
    expect(updateSql).toMatch(/organization_id/i);
    expect(updateSql).toContain("99999999-9999-4999-8999-999999999999");
  });

  it("updateMediaFolder validates target folder organization in SQL", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const port = createS3MediaStoragePort();
    const ok = await port.updateMediaFolder(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(ok).toBe(true);
    const updateSql = approxSqlAt(0);
    expect(updateSql).toMatch(/media_folders/i);
    expect(updateSql).toMatch(/organization_id/i);
    expect(updateSql).toContain("99999999-9999-4999-8999-999999999999");
  });

  it("deleteHard queues pending_delete for S3-backed file (no immediate s3 delete)", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ s3_key: "media/x/f.mp4", status: "ready" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rowCount: 0, rows: [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(deleted).toBe(true);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
    expect(approxSqlAt(1)).toContain("pending_delete");
    expect(approxSqlAt(1)).toContain("99999999-9999-4999-8999-999999999999");
  });

  it("deleteHard removes DB row when row has no s3_key", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ s3_key: null, status: "ready" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rowCount: 0, rows: [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    expect(deleted).toBe(true);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
  });

  it("deleteHard returns false when record not found", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [] });
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rowCount: 0, rows: [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(deleted).toBe(false);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
  });
});

describe("purgePendingMediaDeleteBatch", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    connectQueryMock.mockReset();
    s3DeleteObjectMock.mockReset();
    s3ListObjectKeysUnderPrefixMock.mockReset();
    s3DeleteObjectMock.mockResolvedValue(undefined);
    s3ListObjectKeysUnderPrefixMock.mockResolvedValue([]);
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  it("collectS3KeysForMediaPurge merges list results with source mp4", async () => {
    s3ListObjectKeysUnderPrefixMock
      .mockResolvedValueOnce(["media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/hls/master.m3u8"])
      .mockResolvedValueOnce(["media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/poster/poster.jpg"]);
    const keys = await collectS3KeysForMediaPurge({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      s3_key: "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/video.mp4",
      preview_sm_key: "previews/sm/x.jpg",
      preview_md_key: null,
      hls_artifact_prefix: null,
      poster_s3_key: null,
      hls_master_playlist_s3_key: null,
    });
    expect(keys.sort()).toEqual(
      [
        "previews/sm/x.jpg",
        "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/hls/master.m3u8",
        "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/poster/poster.jpg",
        "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/video.mp4",
      ].sort(),
    );
  });

  it("increments delete_attempts and counts errors when S3 delete fails", async () => {
    s3DeleteObjectMock.mockRejectedValueOnce(new Error("s3 unavailable"));
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            s3_key: "media/a/x",
            status: "pending_delete",
            delete_attempts: 0,
            preview_sm_key: null,
            preview_md_key: null,
            hls_artifact_prefix: null,
            poster_s3_key: null,
            hls_master_playlist_s3_key: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const r = await purgePendingMediaDeleteBatch(5);
    expect(r.errors).toBe(1);
    expect(r.removed).toBe(0);
    expect(s3DeleteObjectMock).toHaveBeenCalledWith("media/a/x");
    expect(approxSqlAt(1)).toContain("delete_attempts");
  });

  it("does not throw when DB delete is blocked by check constraint", async () => {
    const pgConstraintErr = Object.assign(new Error("check constraint"), {
      code: "23514",
      constraint: "program_item_discussion_messages_payload_check",
    });

    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            s3_key: "media/a/x",
            status: "pending_delete",
            delete_attempts: 2,
            preview_sm_key: null,
            preview_md_key: null,
            hls_artifact_prefix: null,
            poster_s3_key: null,
            hls_master_playlist_s3_key: null,
          },
        ],
      })
      .mockRejectedValueOnce(pgConstraintErr)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const r = await purgePendingMediaDeleteBatch(5);
    expect(r.errors).toBe(1);
    expect(r.removed).toBe(0);
    expect(s3DeleteObjectMock).toHaveBeenCalledWith("media/a/x");
    expect(approxSqlAt(2)).toContain("delete_attempts");
  });
});
