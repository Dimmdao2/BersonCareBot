import { describe, expect, it } from "vitest";
import {
  CLIENT_FILES_ROOT_FOLDER_NAME,
  clientPatientFolderBaseName,
  clientPatientFolderFallbackName,
  findClientFilesRootFolder,
  foldersForLibraryScopeSelect,
} from "./clientFilesFolders";
import type { MediaFolderRecord } from "./types";

describe("clientFilesFolders", () => {
  const folders: MediaFolderRecord[] = [
    { id: "root", parentId: null, name: CLIENT_FILES_ROOT_FOLDER_NAME, kind: "client_files_root", createdAt: "t" },
    { id: "p1", parentId: "root", name: "Иван Петров", kind: "client_patient", patientUserId: "u1", createdAt: "t" },
    { id: "s1", parentId: null, name: "Маркетинг", kind: "standard", createdAt: "t" },
  ];

  it("finds client files root", () => {
    expect(findClientFilesRootFolder(folders)?.id).toBe("root");
  });

  it("filters scope select folders to standard only", () => {
    expect(foldersForLibraryScopeSelect(folders).map((f) => f.id)).toEqual(["s1"]);
  });

  it("uses plain display name for patient folder by default", () => {
    expect(clientPatientFolderBaseName("Иван Петров")).toBe("Иван Петров");
  });

  it("adds suffix only as fallback on name collision", () => {
    expect(clientPatientFolderFallbackName("Иван Петров", "abcd1234-0000-4000-8000-000000000001")).toBe(
      "Иван Петров · abcd1234",
    );
  });
});
