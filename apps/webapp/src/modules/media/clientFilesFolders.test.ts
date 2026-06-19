import { describe, expect, it } from "vitest";
import {
  CLIENT_FILES_ROOT_FOLDER_NAME,
  clientPatientFolderBaseName,
  clientPatientFolderFallbackName,
  clientPatientFolderFioName,
  findClientFilesRootFolder,
  foldersForLibraryScopeSelect,
} from "./clientFilesFolders";
import type { MediaFolderRecord } from "./types";

describe("clientFilesFolders", () => {
  const folders: MediaFolderRecord[] = [
    { id: "root", parentId: null, name: CLIENT_FILES_ROOT_FOLDER_NAME, kind: "client_files_root", createdAt: "t" },
    {
      id: "p1",
      parentId: "root",
      name: "Иванов Иван Иванович",
      kind: "client_patient",
      patientUserId: "u1",
      createdAt: "t",
    },
    { id: "s1", parentId: null, name: "Маркетинг", kind: "standard", createdAt: "t" },
  ];

  it("finds client files root", () => {
    expect(findClientFilesRootFolder(folders)?.id).toBe("root");
  });

  it("filters scope select folders to standard only", () => {
    expect(foldersForLibraryScopeSelect(folders).map((f) => f.id)).toEqual(["s1"]);
  });

  it("root folder name is «Пациенты»", () => {
    expect(CLIENT_FILES_ROOT_FOLDER_NAME).toBe("Пациенты");
  });

  it("uses plain display name for patient folder by default", () => {
    expect(clientPatientFolderBaseName("Иван Петров")).toBe("Иван Петров");
  });

  it("adds suffix only as fallback on name collision", () => {
    expect(clientPatientFolderFallbackName("Иван Петров", "abcd1234-0000-4000-8000-000000000001")).toBe(
      "Иван Петров · abcd1234",
    );
  });

  describe("clientPatientFolderFioName", () => {
    it("joins Фамилия Имя Отчество in correct order", () => {
      expect(clientPatientFolderFioName("Иванов", "Иван", "Иванович")).toBe("Иванов Иван Иванович");
    });

    it("handles missing patronymic", () => {
      expect(clientPatientFolderFioName("Иванов", "Иван", null)).toBe("Иванов Иван");
    });

    it("handles missing firstName and patronymic", () => {
      expect(clientPatientFolderFioName("Иванов", null, null)).toBe("Иванов");
    });

    it("falls back to Клиент when all parts are null", () => {
      expect(clientPatientFolderFioName(null, null, null)).toBe("Клиент");
    });

    it("falls back to Клиент when all parts are empty strings", () => {
      expect(clientPatientFolderFioName("", "  ", "")).toBe("Клиент");
    });

    it("trims whitespace from each part", () => {
      expect(clientPatientFolderFioName("  Иванов  ", " Иван ", " Иванович ")).toBe("Иванов Иван Иванович");
    });

    it("caps result at 180 chars", () => {
      const long = "А".repeat(100);
      const result = clientPatientFolderFioName(long, long, null);
      expect(result.length).toBeLessThanOrEqual(180);
    });
  });
});
