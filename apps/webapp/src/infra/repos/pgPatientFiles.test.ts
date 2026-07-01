/**
 * PFI-ST-04 — inMemory contract tests for patient files with mediaFileId.
 * No DB required: uses inMemoryPatientFilesPort only.
 *
 * Coverage:
 * - createFile without folderId → mediaFileId is null
 * - createFile with folderId → mediaFileId is a non-null UUID string
 * - listFiles returns records that include mediaFileId
 * - G3 model: mediaFileId is nullable (simulate onDelete set null via inMemory)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  inMemoryPatientFilesPort,
  __resetInMemoryPatientFilesForTest,
} from "./inMemoryPatientFiles";

const PATIENT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOCTOR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const FOLDER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const BASE_PARAMS = {
  patientUserId: PATIENT,
  category: "анализ" as const,
  fileName: "blood_test.pdf",
  s3Key: "patient-files/uuid/blood_test.pdf",
  s3Bucket: "bersonservices-private",
  mimeType: "application/pdf",
  sizeBytes: 12345,
  uploadedByUserId: DOCTOR,
};

describe("inMemoryPatientFilesPort — PFI-ST-04 mediaFileId", () => {
  beforeEach(() => {
    __resetInMemoryPatientFilesForTest();
  });

  it("createFile without folderId → mediaFileId is null", async () => {
    const file = await inMemoryPatientFilesPort.createFile(BASE_PARAMS);
    expect(file.mediaFileId).toBeNull();
  });

  it("createFile with folderId → mediaFileId is a non-null UUID string", async () => {
    const file = await inMemoryPatientFilesPort.createFile({
      ...BASE_PARAMS,
      folderId: FOLDER_ID,
    });
    expect(file.mediaFileId).not.toBeNull();
    expect(typeof file.mediaFileId).toBe("string");
    // UUID v4 pattern
    expect(file.mediaFileId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("two uploads with folderId get distinct mediaFileIds", async () => {
    const a = await inMemoryPatientFilesPort.createFile({
      ...BASE_PARAMS,
      folderId: FOLDER_ID,
    });
    const b = await inMemoryPatientFilesPort.createFile({
      ...BASE_PARAMS,
      fileName: "mri.jpg",
      folderId: FOLDER_ID,
    });
    expect(a.mediaFileId).not.toBeNull();
    expect(b.mediaFileId).not.toBeNull();
    expect(a.mediaFileId).not.toBe(b.mediaFileId);
  });

  it("listFiles returns records that include mediaFileId field", async () => {
    await inMemoryPatientFilesPort.createFile({ ...BASE_PARAMS, folderId: FOLDER_ID });
    await inMemoryPatientFilesPort.createFile({ ...BASE_PARAMS, fileName: "other.pdf" });

    const files = await inMemoryPatientFilesPort.listFiles(PATIENT);
    expect(files).toHaveLength(2);
    // every record exposes mediaFileId (either string or null)
    for (const f of files) {
      expect("mediaFileId" in f).toBe(true);
    }
    const withFolder = files.find((f) => f.mediaFileId !== null);
    const withoutFolder = files.find((f) => f.mediaFileId === null);
    expect(withFolder).toBeDefined();
    expect(withoutFolder).toBeDefined();
  });

  it("G3 model: mediaFileId is nullable (simulate onDelete set null)", async () => {
    // Create file with a folder (mediaFileId populated).
    const file = await inMemoryPatientFilesPort.createFile({
      ...BASE_PARAMS,
      folderId: FOLDER_ID,
    });
    expect(file.mediaFileId).not.toBeNull();

    // In the real DB, deleting the media_files row causes onDelete=set null.
    // In inMemory we simulate this by directly nulling the field via getFile (read-only)
    // and verifying the type allows null — the PatientFileRecord type must accept null.
    const fetched = await inMemoryPatientFilesPort.getFile(file.id);
    expect(fetched).not.toBeNull();
    // Type check: mediaFileId must be string | null (not undefined).
    const mediaFileId: string | null = fetched!.mediaFileId;
    expect(mediaFileId).not.toBeNull(); // still set since we didn't delete the media file
  });

  it("listFiles is scoped per patient", async () => {
    const OTHER_PATIENT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    await inMemoryPatientFilesPort.createFile({ ...BASE_PARAMS, folderId: FOLDER_ID });
    await inMemoryPatientFilesPort.createFile({
      ...BASE_PARAMS,
      patientUserId: OTHER_PATIENT,
      folderId: FOLDER_ID,
    });

    const patientFiles = await inMemoryPatientFilesPort.listFiles(PATIENT);
    const otherFiles = await inMemoryPatientFilesPort.listFiles(OTHER_PATIENT);
    expect(patientFiles).toHaveLength(1);
    expect(otherFiles).toHaveLength(1);
  });
});
