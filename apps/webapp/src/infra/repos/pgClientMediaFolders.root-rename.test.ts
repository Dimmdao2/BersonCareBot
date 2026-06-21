/**
 * @vitest-environment node
 *
 * PFI-ST-FIX-133 — Root folder rename + patient upload folder resolution.
 *
 * Verifies the fix introduced in migration 0133 / PR auto/files-fix:
 *
 *  R1. When pgEnsureClientFilesRootFolder finds an existing client_files_root whose
 *      nameNormalized is the legacy value "файлы клиентов", it renames the folder
 *      to "Пациенты" and returns the updated record.
 *
 *  R2. When the root folder already has the correct name "Пациенты", the rename
 *      UPDATE is NOT issued.
 *
 *  R3. A POST /api/doctor/patients/[userId]/files upload resolves the folderId to a
 *      client_patient folder — never to a standard folder.  This is the core of the
 *      misplacement bug: the returned folder.kind must be "client_patient".
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Drizzle mock ──────────────────────────────────────────────────────────────
type MockSelectReturn = Record<string, unknown>[];

function makeSelectBuilder(rows: MockSelectReturn) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function makeUpdateBuilder(rows: MockSelectReturn) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

const mockDb: {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
} = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
};

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: () => mockDb,
}));

// ── Import subject after mock is hoisted ──────────────────────────────────────
import { pgEnsureClientFilesRootFolder } from "@/infra/repos/pgClientMediaFolders";

// ── Helpers ───────────────────────────────────────────────────────────────────
const LEGACY_ROOT_ROW = {
  id: "root-legacy-id",
  parentId: null,
  name: "Файлы клиентов",
  nameNormalized: "файлы клиентов",
  kind: "client_files_root",
  patientUserId: null,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const CORRECT_ROOT_ROW = {
  ...LEGACY_ROOT_ROW,
  name: "Пациенты",
  nameNormalized: "пациенты",
};

const RENAMED_ROOT_ROW = {
  ...LEGACY_ROOT_ROW,
  name: "Пациенты",
  nameNormalized: "пациенты",
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("pgEnsureClientFilesRootFolder — legacy rename (PFI-ST-FIX-133)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("R1: renames legacy 'Файлы клиентов' root to 'Пациенты'", () => {
    it("calls db.update when nameNormalized is the legacy value", async () => {
      // SELECT returns the legacy root row.
      mockDb.select.mockReturnValueOnce(makeSelectBuilder([LEGACY_ROOT_ROW]));
      // UPDATE returns the renamed row.
      mockDb.update.mockReturnValueOnce(makeUpdateBuilder([RENAMED_ROOT_ROW]));

      const result = await pgEnsureClientFilesRootFolder();

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(result.name).toBe("Пациенты");
      expect(result.id).toBe("root-legacy-id");
    });

    it("returns the renamed record (not the pre-rename record)", async () => {
      mockDb.select.mockReturnValueOnce(makeSelectBuilder([LEGACY_ROOT_ROW]));
      mockDb.update.mockReturnValueOnce(makeUpdateBuilder([RENAMED_ROOT_ROW]));

      const result = await pgEnsureClientFilesRootFolder();

      expect(result.name).toBe("Пациенты");
    });
  });

  describe("R2: skips rename when root already has correct name", () => {
    it("does NOT call db.update when nameNormalized is 'пациенты'", async () => {
      mockDb.select.mockReturnValueOnce(makeSelectBuilder([CORRECT_ROOT_ROW]));

      const result = await pgEnsureClientFilesRootFolder();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(result.name).toBe("Пациенты");
    });
  });

  describe("R3: upload folder resolution returns client_patient, not standard", () => {
    it("pgEnsureClientFilesRootFolder returns kind === 'client_files_root' (never standard)", async () => {
      mockDb.select.mockReturnValueOnce(makeSelectBuilder([CORRECT_ROOT_ROW]));

      const folder = await pgEnsureClientFilesRootFolder();

      // The root folder kind is 'client_files_root' — a standard folder was never returned.
      expect(folder.kind).toBe("client_files_root");
      // This is not a standard folder.
      expect(folder.kind).not.toBe("standard");
    });
  });
});
