import {
  ClinicalTestArchiveAlreadyArchivedError,
  ClinicalTestArchiveNotFoundError,
  ClinicalTestUnarchiveNotArchivedError,
  ClinicalTestUsageConfirmationRequiredError,
  TestSetArchiveAlreadyArchivedError,
  TestSetArchiveNotFoundError,
  TestSetUnarchiveNotArchivedError,
  TestSetUsageConfirmationRequiredError,
} from "./errors";
import type { ClinicalTestsPort, TestSetsPort } from "./ports";
import type {
  ArchiveClinicalTestOptions,
  ArchiveTestSetOptions,
  CreateClinicalTestInput,
  CreateTestSetInput,
  ClinicalTestFilter,
  TestSetFilter,
  UpdateClinicalTestInput,
  UpdateTestSetInput,
  TestSetItemInput,
} from "./types";
import { clinicalTestArchiveRequiresAcknowledgement, testSetArchiveRequiresAcknowledgement } from "./types";

export function createClinicalTestsService(port: ClinicalTestsPort) {
  return {
    async listClinicalTests(filter: ClinicalTestFilter = {}) {
      return port.list(filter);
    },

    async getClinicalTest(id: string) {
      return port.getById(id);
    },

    async createClinicalTest(input: CreateClinicalTestInput, createdBy: string | null) {
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название теста обязательно");
      return port.create(
        {
          ...input,
          title,
          description: input.description?.trim() || null,
          testType: input.testType?.trim() || null,
        },
        createdBy,
      );
    },

    async updateClinicalTest(id: string, input: UpdateClinicalTestInput) {
      const existing = await port.getById(id);
      if (!existing) throw new Error("Тест не найден");
      if (existing.isArchived) {
        throw new Error("Тест в архиве. Верните из архива, чтобы редактировать.");
      }
      const patch: UpdateClinicalTestInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название теста обязательно");
        patch.title = t;
      }
      if (input.description !== undefined) patch.description = input.description?.trim() || null;
      if (input.testType !== undefined) patch.testType = input.testType?.trim() || null;
      const row = await port.update(id, patch);
      if (!row) throw new Error("Тест не найден");
      return row;
    },

    async getClinicalTestUsage(id: string) {
      return port.getClinicalTestUsageSummary(id);
    },

    async archiveClinicalTest(id: string, options?: ArchiveClinicalTestOptions) {
      const existing = await port.getById(id);
      if (!existing) throw new ClinicalTestArchiveNotFoundError();
      if (existing.isArchived) throw new ClinicalTestArchiveAlreadyArchivedError();

      const usage = await port.getClinicalTestUsageSummary(id);
      if (clinicalTestArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new ClinicalTestUsageConfirmationRequiredError(usage);
      }

      const ok = await port.archive(id);
      if (!ok) throw new ClinicalTestArchiveNotFoundError();
    },

    async unarchiveClinicalTest(id: string) {
      const existing = await port.getById(id);
      if (!existing) throw new ClinicalTestArchiveNotFoundError();
      if (!existing.isArchived) throw new ClinicalTestUnarchiveNotArchivedError();

      const ok = await port.unarchive(id);
      if (!ok) throw new ClinicalTestArchiveNotFoundError();
    },
  };
}

export function createTestSetsService(setsPort: TestSetsPort, testsPort: ClinicalTestsPort) {
  return {
    async listTestSets(filter: TestSetFilter = {}) {
      return setsPort.list(filter);
    },

    async getTestSet(id: string) {
      return setsPort.getById(id);
    },

    async createTestSet(input: CreateTestSetInput, createdBy: string | null) {
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название набора обязательно");
      return setsPort.create(
        {
          ...input,
          title,
          description: input.description?.trim() || null,
        },
        createdBy,
      );
    },

    async updateTestSet(id: string, input: UpdateTestSetInput) {
      const existing = await setsPort.getById(id);
      if (!existing) throw new Error("Набор не найден");
      if (existing.isArchived) {
        throw new Error("Набор в архиве. Верните из архива, чтобы редактировать.");
      }
      const patch: UpdateTestSetInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название набора обязательно");
        patch.title = t;
      }
      if (input.description !== undefined) patch.description = input.description?.trim() || null;
      if (input.publicationStatus !== undefined) {
        if (input.publicationStatus !== "draft" && input.publicationStatus !== "published") {
          throw new Error("Некорректный статус публикации");
        }
        patch.publicationStatus = input.publicationStatus;
      }
      const row = await setsPort.update(id, patch);
      if (!row) throw new Error("Набор не найден");
      return row;
    },

    async getTestSetUsage(id: string) {
      return setsPort.getTestSetUsageSummary(id);
    },

    async archiveTestSet(id: string, options?: ArchiveTestSetOptions) {
      const existing = await setsPort.getById(id);
      if (!existing) throw new TestSetArchiveNotFoundError();
      if (existing.isArchived) throw new TestSetArchiveAlreadyArchivedError();

      const usage = await setsPort.getTestSetUsageSummary(id);
      if (testSetArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new TestSetUsageConfirmationRequiredError(usage);
      }

      const ok = await setsPort.archive(id);
      if (!ok) throw new TestSetArchiveNotFoundError();
    },

    async unarchiveTestSet(id: string) {
      const existing = await setsPort.getById(id);
      if (!existing) throw new TestSetArchiveNotFoundError();
      if (!existing.isArchived) throw new TestSetUnarchiveNotArchivedError();

      const ok = await setsPort.unarchive(id);
      if (!ok) throw new TestSetArchiveNotFoundError();
    },

    async setTestSetItems(testSetId: string, items: TestSetItemInput[]) {
      const set = await setsPort.getById(testSetId);
      if (!set) throw new Error("Набор не найден");
      if (set.isArchived) {
        throw new Error("Набор в архиве. Верните из архива, чтобы менять состав.");
      }

      const normalized = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const it of normalized) {
        const test = await testsPort.getById(it.testId);
        if (!test) throw new Error(`Тест не найден: ${it.testId}`);
        if (test.isArchived) throw new Error(`Тест архивирован и не может входить в набор: ${test.title}`);
      }

      await setsPort.replaceItems(testSetId, normalized);
    },
  };
}

export type ClinicalTestsService = ReturnType<typeof createClinicalTestsService>;
export type TestSetsService = ReturnType<typeof createTestSetsService>;
