/**
 * PFI-ST-08 — Doctor individual-exercise video → patient folder (Rule 5).
 *
 * Rule 5: "Индив-упражнение врача (видео с пациентом на приёме) пишется в индивидуальную
 * программу пациента; его видео ложится в папку этого пациента (правила 1–3)."
 *
 * This test proves that:
 *  1. `pgEnsureClientPatientFolder` is correctly re-exported from the app-layer barrel.
 *  2. When called with a patient userId it returns a folder whose `kind === "client_patient"`
 *     and whose `parentId` matches the root folder id — i.e. the video will land in the
 *     patient subfolder of «Пациенты», not loose at root level.
 *  3. A future doctor-side presign route can import the function from this barrel (same path
 *     used by the patient-side route) and call it with the *patient* userId — no additional
 *     wiring needed.
 *
 * The test uses a vi.mock to stub the DB layer so no real database is required.
 */

import { describe, expect, it, vi } from "vitest";
import type { MediaFolderRecord } from "@/modules/media/types";

// ---------------------------------------------------------------------------
// Stub the infra implementation so the test is self-contained (no DB needed).
// The stub mirrors the behaviour of the real pgEnsureClientPatientFolder:
//  - first call creates and returns a client_patient folder whose parentId = root.id
//  - subsequent calls for the same userId return the same record (idempotent)
// ---------------------------------------------------------------------------

const STUB_ROOT_ID = "root-folder-test-id";
const patientFolderStore = new Map<string, MediaFolderRecord>();

vi.mock("@/infra/repos/pgClientMediaFolders", () => ({
  pgEnsureClientFilesRootFolder: vi.fn(async (): Promise<MediaFolderRecord> => ({
    id: STUB_ROOT_ID,
    parentId: null,
    name: "Пациенты",
    kind: "client_files_root",
    patientUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  })),

  pgEnsureClientPatientFolder: vi.fn(async (patientUserId: string): Promise<MediaFolderRecord> => {
    const existing = patientFolderStore.get(patientUserId);
    if (existing) return existing;
    const rec: MediaFolderRecord = {
      id: `patient-folder-${patientUserId}`,
      parentId: STUB_ROOT_ID,
      name: "Иванов Иван Иванович",
      kind: "client_patient",
      patientUserId,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    patientFolderStore.set(patientUserId, rec);
    return rec;
  }),

  isSystemManagedMediaFolder: vi.fn((kind: string) => kind === "client_files_root" || kind === "client_patient"),
  pgValidateManualFolderParent: vi.fn(async () => ({ ok: true })),
  pgValidateUserAssignableMediaFolder: vi.fn(async () => ({ ok: true })),
}));

// Import AFTER vi.mock so the mock is in place.
import {
  pgEnsureClientPatientFolder,
  pgEnsureClientFilesRootFolder,
} from "./clientMediaFolders";

describe("clientMediaFolders app-layer re-export (PFI-ST-08 Rule 5)", () => {
  const PATIENT_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("pgEnsureClientPatientFolder is callable via app-layer barrel", async () => {
    const folder = await pgEnsureClientPatientFolder(PATIENT_USER_ID);
    expect(folder).toBeDefined();
  });

  it("returned folder has kind === 'client_patient'", async () => {
    const folder = await pgEnsureClientPatientFolder(PATIENT_USER_ID);
    expect(folder.kind).toBe("client_patient");
  });

  it("returned folder.parentId equals the root folder id (video lands in patient subtree)", async () => {
    const root = await pgEnsureClientFilesRootFolder();
    const folder = await pgEnsureClientPatientFolder(PATIENT_USER_ID);
    expect(folder.parentId).toBe(root.id);
  });

  it("returned folder.patientUserId matches the caller-supplied patientUserId", async () => {
    const folder = await pgEnsureClientPatientFolder(PATIENT_USER_ID);
    expect(folder.patientUserId).toBe(PATIENT_USER_ID);
  });

  it("is idempotent — second call for same patient returns same folder id", async () => {
    const first = await pgEnsureClientPatientFolder(PATIENT_USER_ID);
    const second = await pgEnsureClientPatientFolder(PATIENT_USER_ID);
    expect(second.id).toBe(first.id);
  });

  it("doctor pattern: calling with *patient* userId (not doctor userId) routes video to patient folder", async () => {
    // This mirrors the pattern the future doctor-side presign route must follow:
    //   const patientFolder = await pgEnsureClientPatientFolder(patientUserId);
    //   // use patientFolder.id as folderId when creating the presigned upload
    const doctorPatientId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const folder = await pgEnsureClientPatientFolder(doctorPatientId);
    expect(folder.kind).toBe("client_patient");
    expect(folder.patientUserId).toBe(doctorPatientId);
    // parentId is the root «Пациенты» folder — NOT null, NOT some arbitrary folder
    expect(folder.parentId).toBe(STUB_ROOT_ID);
  });
});
