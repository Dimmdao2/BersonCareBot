import { describe, expect, it } from "vitest";
import {
  CLIENT_FILES_ROOT_FOLDER_NAME,
  findClientFilesRootFolder,
  foldersForLibraryScopeSelect,
  formatClientPatientFolderName,
} from "./clientFilesFolders";
import type { MediaFolderRecord } from "./types";

describe("clientFilesFolders", () => {
  const folders: MediaFolderRecord[] = [
    { id: "root", parentId: null, name: CLIENT_FILES_ROOT_FOLDER_NAME, kind: "client_files_root", createdAt: "t" },
    { id: "p1", parentId: "root", name: "Иван · abcd1234", kind: "client_patient", patientUserId: "u1", createdAt: "t" },
    { id: "s1", parentId: null, name: "Маркетинг", kind: "standard", createdAt: "t" },
  ];

  it("finds client files root", () => {
    expect(findClientFilesRootFolder(folders)?.id).toBe("root");
  });

  it("filters scope select folders to standard only", () => {
    expect(foldersForLibraryScopeSelect(folders).map((f) => f.id)).toEqual(["s1"]);
  });

  it("formats patient folder name with short id suffix", () => {
    expect(formatClientPatientFolderName("Иван Петров", "abcd1234-0000-4000-8000-000000000001")).toBe(
      "Иван Петров · abcd1234",
    );
  });
});
