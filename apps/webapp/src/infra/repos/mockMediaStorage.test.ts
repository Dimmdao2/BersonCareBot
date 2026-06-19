/**
 * PFI-ST-03 — Regression guard: «hide from all-folders view» for patient-subtree files.
 *
 * Rule 3: When listing without an explicit folder scope (folderId omitted), files stored
 * under the «Файлы клиентов» subtree (kind = client_files_root | client_patient) MUST be
 * excluded from results. This guard prevents silent regression of the behavior.
 *
 * The mockMediaStorage already implements the filter at lines ~66-69. These tests lock that
 * behavior so any accidental removal fails loudly.
 */
import { describe, expect, it } from "vitest";
import { mockMediaStoragePort, seedFolderForTest } from "./mockMediaStorage";

// The mock uses module-level Maps; each test uses a unique timestamp tag in filenames and
// filters results with `query:` so state accumulated across tests does not pollute assertions.

function makeBody(): ArrayBuffer {
  return new Uint8Array([1, 2, 3]).buffer as ArrayBuffer;
}

describe("mockMediaStorage.list — excludeClientFiles regression guard (PFI-ST-03)", () => {
  it("default list (folderId omitted) hides files stored in a client_files_root folder", async () => {
    const tag = `pfi-st03-a-${Date.now()}`;
    const clientRoot = seedFolderForTest("client-root-a", "client_files_root", null);

    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-lib.png`, mimeType: "image/png", folderId: null });
    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-client.png`, mimeType: "image/png", folderId: clientRoot.id });

    // excludeClientFiles defaults to true when folderId is omitted
    const result = await mockMediaStoragePort.list({ query: tag });

    const filenames = result.items.map((i) => i.filename);
    expect(filenames).toContain(`${tag}-lib.png`);
    expect(filenames).not.toContain(`${tag}-client.png`);
  });

  it("default list hides files in a client_patient subfolder", async () => {
    const tag = `pfi-st03-b-${Date.now()}`;
    const clientRoot = seedFolderForTest("client-root-b", "client_files_root", null);
    const patientFolder = seedFolderForTest("patient-b", "client_patient", clientRoot.id);

    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-lib.png`, mimeType: "image/png", folderId: null });
    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-patient.png`, mimeType: "image/png", folderId: patientFolder.id });

    const result = await mockMediaStoragePort.list({ query: tag });

    const filenames = result.items.map((i) => i.filename);
    expect(filenames).toContain(`${tag}-lib.png`);
    expect(filenames).not.toContain(`${tag}-patient.png`);
  });

  it("explicit folderId scope bypasses the client-files hide rule and shows the files", async () => {
    const tag = `pfi-st03-c-${Date.now()}`;
    const clientRoot = seedFolderForTest("client-root-c", "client_files_root", null);
    const patientFolder = seedFolderForTest("patient-c", "client_patient", clientRoot.id);

    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-patient.png`, mimeType: "image/png", folderId: patientFolder.id });

    // Scoped to the exact patient folder — should show the file
    const result = await mockMediaStoragePort.list({ folderId: patientFolder.id, query: tag });

    expect(result.items.map((i) => i.filename)).toContain(`${tag}-patient.png`);
  });

  it("excludeClientFiles:false override exposes patient files without a folder scope", async () => {
    const tag = `pfi-st03-d-${Date.now()}`;
    const clientRoot = seedFolderForTest("client-root-d", "client_files_root", null);
    const patientFolder = seedFolderForTest("patient-d", "client_patient", clientRoot.id);

    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-patient.png`, mimeType: "image/png", folderId: patientFolder.id });

    const result = await mockMediaStoragePort.list({ excludeClientFiles: false, query: tag });

    expect(result.items.map((i) => i.filename)).toContain(`${tag}-patient.png`);
  });

  it("total count reflects the hide rule: 0 when hidden, 2 when override is set", async () => {
    const tag = `pfi-st03-e-${Date.now()}`;
    const clientRoot = seedFolderForTest("client-root-e", "client_files_root", null);

    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-c1.png`, mimeType: "image/png", folderId: clientRoot.id });
    await mockMediaStoragePort.upload({ body: makeBody(), filename: `${tag}-c2.png`, mimeType: "image/png", folderId: clientRoot.id });

    const hidden = await mockMediaStoragePort.list({ query: tag });
    const visible = await mockMediaStoragePort.list({ excludeClientFiles: false, query: tag });

    expect(hidden.total).toBe(0);
    expect(visible.total).toBe(2);
  });
});
