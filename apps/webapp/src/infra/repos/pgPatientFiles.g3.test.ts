/**
 * @vitest-environment node
 *
 * PFI-ST-04 G3 consistency tests for pgPatientFiles repo.
 *
 * G3a: When createFile is called with a folderId, it inserts a media_files row and
 *      sets mediaFileId on the patient_files row — the returned record's mediaFileId
 *      matches the media_files id returned by the insert.
 *
 * G3b: The patient_files.media_file_id FK has onDelete: "set null" — the schema
 *      definition is asserted here to prevent silent regression. This means deleting
 *      a patient_files row does NOT cascade-delete the media_files row.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Drizzle mock ──────────────────────────────────────────────────────────────

type MockInsertReturn = {
  id: string;
  [key: string]: unknown;
};

// We track insert calls to assert sequencing and values.
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];

function makeMockInsertBuilder(returnRows: MockInsertReturn[]) {
  const builder = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnRows),
  };
  return builder;
}

const mockDrizzle = {
  insert: vi.fn(),
};

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: () => mockDrizzle,
}));

// ── Import subject after mock is hoisted ──────────────────────────────────────
import { createPgPatientFilesPort } from "@/infra/repos/pgPatientFiles";
import { patientFiles } from "../../../db/schema/patientFiles";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_PARAMS = {
  patientUserId: "00000000-0000-4000-8000-000000000001",
  category: "прочее" as const,
  fileName: "test.pdf",
  s3Key: "patient-files/abc/test.pdf",
  s3Bucket: "bersonservices-private",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  uploadedByUserId: "00000000-0000-4000-8000-000000000002",
};

const MOCK_MEDIA_FILE_ID = "00000000-0000-4000-8888-000000000010";
const MOCK_PATIENT_FILE_ID = "00000000-0000-4000-9999-000000000020";
const MOCK_FOLDER_ID = "00000000-0000-4000-7777-000000000030";

function makePatientFileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_PATIENT_FILE_ID,
    patientUserId: BASE_PARAMS.patientUserId,
    category: BASE_PARAMS.category,
    fileName: BASE_PARAMS.fileName,
    s3Key: BASE_PARAMS.s3Key,
    s3Bucket: BASE_PARAMS.s3Bucket,
    mimeType: BASE_PARAMS.mimeType,
    sizeBytes: BASE_PARAMS.sizeBytes,
    visitId: null,
    mediaFileId: MOCK_MEDIA_FILE_ID,
    uploadedByUserId: BASE_PARAMS.uploadedByUserId,
    createdAt: "2026-06-19T00:00:00Z",
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("pgPatientFiles — G3 consistency (PFI-ST-04)", () => {
  let port: ReturnType<typeof createPgPatientFilesPort>;

  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.length = 0;
    port = createPgPatientFilesPort();
  });

  describe("G3a: createFile with folderId links media_files row via mediaFileId", () => {
    it("inserts into media_files first, then patient_files with the returned mediaFileId", async () => {
      // First insert call → media_files row
      const mediaInsertBuilder = makeMockInsertBuilder([{ id: MOCK_MEDIA_FILE_ID }]);
      // Second insert call → patient_files row
      const patientInsertBuilder = makeMockInsertBuilder([makePatientFileRow()]);

      mockDrizzle.insert
        .mockReturnValueOnce(mediaInsertBuilder)
        .mockReturnValueOnce(patientInsertBuilder);

      const result = await port.createFile({ ...BASE_PARAMS, folderId: MOCK_FOLDER_ID });

      // Two inserts happened
      expect(mockDrizzle.insert).toHaveBeenCalledTimes(2);

      // The result's mediaFileId matches what the media_files insert returned
      expect(result.mediaFileId).toBe(MOCK_MEDIA_FILE_ID);
      expect(result.id).toBe(MOCK_PATIENT_FILE_ID);
    });

    it("passes folderId and file metadata to the media_files insert", async () => {
      const mediaInsertBuilder = makeMockInsertBuilder([{ id: MOCK_MEDIA_FILE_ID }]);
      const patientInsertBuilder = makeMockInsertBuilder([makePatientFileRow()]);

      mockDrizzle.insert
        .mockReturnValueOnce(mediaInsertBuilder)
        .mockReturnValueOnce(patientInsertBuilder);

      await port.createFile({ ...BASE_PARAMS, folderId: MOCK_FOLDER_ID });

      // media_files insert: first call
      expect(mediaInsertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: MOCK_FOLDER_ID,
          mimeType: BASE_PARAMS.mimeType,
          sizeBytes: BASE_PARAMS.sizeBytes,
          s3Key: BASE_PARAMS.s3Key,
          status: "ready",
        }),
      );

      // patient_files insert: second call, receives mediaFileId
      expect(patientInsertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaFileId: MOCK_MEDIA_FILE_ID,
        }),
      );
    });

    it("sets mediaFileId to null when no folderId is provided (backwards-compat)", async () => {
      const patientInsertBuilder = makeMockInsertBuilder([
        makePatientFileRow({ mediaFileId: null }),
      ]);

      mockDrizzle.insert.mockReturnValueOnce(patientInsertBuilder);

      const result = await port.createFile({ ...BASE_PARAMS });

      // Only one insert (no media_files row created)
      expect(mockDrizzle.insert).toHaveBeenCalledTimes(1);
      expect(result.mediaFileId).toBeNull();
    });
  });

  describe("G3b: onDelete:set null semantics — schema column assertion", () => {
    it("patient_files.mediaFileId column is nullable (FK with onDelete set null means media_files row survives patient_files deletion)", () => {
      // The schema uses onDelete: "set null" on the patient_files → media_files FK.
      // This means:
      //   - If a media_files row is deleted → patient_files.media_file_id becomes NULL (not error).
      //   - Deleting a patient_files row has NO effect on the media_files row.
      //
      // We assert the column is nullable (no notNull()) — this is the visible schema
      // property that enforces the set-null semantics are even possible.
      const col = patientFiles.mediaFileId;
      // Drizzle column: notNull is false means it is nullable
      expect((col as unknown as { notNull: boolean }).notNull).toBe(false);
    });

    it("patient_files schema source file declares onDelete set null for media_file_id FK", async () => {
      // Read the schema source to assert the FK definition string is present.
      // This is a regression guard: changing onDelete to "cascade" would break this test.
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const schemaPath = path.resolve(
        __dirname,
        "../../../db/schema/patientFiles.ts",
      );
      const source = await fs.readFile(schemaPath, "utf8");

      // The FK for media_file_id must use onDelete("set null"), not "cascade"
      expect(source).toContain("patient_files_media_file_id_fkey");
      expect(source).toContain('.onDelete("set null")');
      expect(source).not.toMatch(/patient_files_media_file_id_fkey[\s\S]{0,200}\.onDelete\("cascade"\)/);
    });
  });
});
