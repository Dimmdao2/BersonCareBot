import {
  ClinicalTestArchiveAlreadyArchivedError,
  ClinicalTestArchiveNotFoundError,
  ClinicalTestUnarchiveNotArchivedError,
  ClinicalTestUsageConfirmationRequiredError,
  TestSetArchiveAlreadyArchivedError,
  TestSetArchiveNotFoundError,
  TestSetUnarchiveNotArchivedError,
  TestSetUsageConfirmationRequiredError,
} from './errors';
import type { ReferencesPort } from '@/modules/references/ports';
import type { ClinicalTestsPort, TestSetsPort } from './ports';
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
} from './types';
import {
  clinicalTestArchiveRequiresAcknowledgement,
  testSetArchiveRequiresAcknowledgement,
} from './types';
import {
  CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  assessmentKindWriteAllowSet,
} from './clinicalTestAssessmentKind';
import {
  clinicalTestScoringSchema,
  normalizeClinicalTestScoringOrder,
} from './clinicalTestScoring';
import { UserFacingError } from '@/shared/errors/userFacingError';

export type ClinicalTestWriteOptions = {
  runClinicalTestWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type TestSetWriteOptions = {
  runTestSetWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

function runClinicalTestWrite<T>(
  options: ClinicalTestWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runClinicalTestWrite ? options.runClinicalTestWrite(fn) : fn();
}

function runTestSetWrite<T>(
  options: TestSetWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runTestSetWrite ? options.runTestSetWrite(fn) : fn();
}

type ClinicalTestAssessmentWriteContext =
  { kind: 'create' } | { kind: 'update'; existingAssessmentKind: string | null };

async function assertClinicalTestWritePayload(
  references: ReferencesPort,
  input: CreateClinicalTestInput | UpdateClinicalTestInput,
  ctx: ClinicalTestAssessmentWriteContext,
): Promise<void> {
  if (input.assessmentKind !== undefined && input.assessmentKind !== null) {
    const t = input.assessmentKind.trim();
    if (t) {
      const unchangedFromRow =
        ctx.kind === 'update' && (ctx.existingAssessmentKind ?? '').trim() === t;
      if (!unchangedFromRow) {
        const refItems = await references.listActiveItemsByCategoryCode(
          CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
        );
        const allow = assessmentKindWriteAllowSet(refItems);
        if (!allow.has(t)) {
          throw new UserFacingError('Некорректный вид оценки');
        }
      }
    }
  }
  if (input.scoring !== undefined && input.scoring !== null) {
    const p = clinicalTestScoringSchema.safeParse(input.scoring);
    if (!p.success) throw new UserFacingError('Некорректная структура scoring');
  }
}

async function normalizeClinicalWritePayload<
  T extends CreateClinicalTestInput | UpdateClinicalTestInput,
>(references: ReferencesPort, input: T, ctx: ClinicalTestAssessmentWriteContext): Promise<T> {
  await assertClinicalTestWritePayload(references, input, ctx);
  const next = { ...input };
  if (next.scoring != null) {
    const p = clinicalTestScoringSchema.parse(next.scoring);
    return { ...next, scoring: normalizeClinicalTestScoringOrder(p) };
  }
  return next;
}

export function createClinicalTestsService(port: ClinicalTestsPort, references: ReferencesPort) {
  return {
    async listClinicalTests(filter: ClinicalTestFilter = {}) {
      return port.list(filter);
    },

    async getClinicalTest(id: string) {
      return port.getById(id);
    },

    async createClinicalTest(
      input: CreateClinicalTestInput,
      createdBy: string | null,
      options?: ClinicalTestWriteOptions,
    ) {
      const title = input.title?.trim() ?? '';
      if (!title) throw new UserFacingError('Название теста обязательно');
      const normalized = await normalizeClinicalWritePayload(
        references,
        {
          ...input,
          title,
          description: input.description?.trim() || null,
          testType: input.testType?.trim() || null,
          assessmentKind: input.assessmentKind?.trim() || null,
          bodyRegionIds:
            input.bodyRegionIds ??
            (input.bodyRegionId?.trim() ? [input.bodyRegionId.trim()] : undefined),
          rawText: input.rawText?.trim() ? input.rawText.trim() : (input.rawText ?? null),
        },
        { kind: 'create' },
      );
      return runClinicalTestWrite(options, () => port.create(normalized, createdBy));
    },

    async updateClinicalTest(
      id: string,
      input: UpdateClinicalTestInput,
      options?: ClinicalTestWriteOptions,
    ) {
      const existing = await port.getById(id);
      if (!existing) throw new UserFacingError('Тест не найден');
      if (existing.isArchived) {
        throw new UserFacingError('Тест в архиве. Верните из архива, чтобы редактировать.');
      }
      const patch: UpdateClinicalTestInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new UserFacingError('Название теста обязательно');
        patch.title = t;
      }
      if (input.description !== undefined) patch.description = input.description?.trim() || null;
      if (input.testType !== undefined) patch.testType = input.testType?.trim() || null;
      if (input.assessmentKind !== undefined) {
        patch.assessmentKind = input.assessmentKind?.trim() || null;
      }
      if (input.bodyRegionIds !== undefined) {
        patch.bodyRegionIds = input.bodyRegionIds;
      }
      if (input.bodyRegionId !== undefined && input.bodyRegionIds === undefined) {
        patch.bodyRegionId = input.bodyRegionId?.trim() || null;
      }
      if (input.rawText !== undefined) {
        patch.rawText = input.rawText?.trim() ? input.rawText.trim() : null;
      }
      const normalized = await normalizeClinicalWritePayload(references, patch, {
        kind: 'update',
        existingAssessmentKind: existing.assessmentKind,
      });
      const row = await runClinicalTestWrite(options, () => port.update(id, normalized));
      if (!row) throw new UserFacingError('Тест не найден');
      return row;
    },

    async getClinicalTestUsage(id: string) {
      return port.getClinicalTestUsageSummary(id);
    },

    async archiveClinicalTest(
      id: string,
      options?: ArchiveClinicalTestOptions,
      writeOptions?: ClinicalTestWriteOptions,
    ) {
      const existing = await port.getById(id);
      if (!existing) throw new ClinicalTestArchiveNotFoundError();
      if (existing.isArchived) throw new ClinicalTestArchiveAlreadyArchivedError();

      const usage = await port.getClinicalTestUsageSummary(id);
      if (clinicalTestArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new ClinicalTestUsageConfirmationRequiredError(usage);
      }

      const ok = await runClinicalTestWrite(writeOptions, () => port.archive(id));
      if (!ok) throw new ClinicalTestArchiveNotFoundError();
    },

    async unarchiveClinicalTest(id: string, options?: ClinicalTestWriteOptions) {
      const existing = await port.getById(id);
      if (!existing) throw new ClinicalTestArchiveNotFoundError();
      if (!existing.isArchived) throw new ClinicalTestUnarchiveNotArchivedError();

      const ok = await runClinicalTestWrite(options, () => port.unarchive(id));
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

    async createTestSet(
      input: CreateTestSetInput,
      createdBy: string | null,
      options?: TestSetWriteOptions,
    ) {
      const title = input.title?.trim() ?? '';
      if (!title) throw new UserFacingError('Название набора обязательно');
      return runTestSetWrite(options, () =>
        setsPort.create(
          {
            ...input,
            title,
            description: input.description?.trim() || null,
          },
          createdBy,
        ),
      );
    },

    async updateTestSet(id: string, input: UpdateTestSetInput, options?: TestSetWriteOptions) {
      const existing = await setsPort.getById(id);
      if (!existing) throw new UserFacingError('Набор не найден');
      if (existing.isArchived) {
        throw new UserFacingError('Набор в архиве. Верните из архива, чтобы редактировать.');
      }
      const patch: UpdateTestSetInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new UserFacingError('Название набора обязательно');
        patch.title = t;
      }
      if (input.description !== undefined) patch.description = input.description?.trim() || null;
      if (input.publicationStatus !== undefined) {
        if (input.publicationStatus !== 'draft' && input.publicationStatus !== 'published') {
          throw new UserFacingError('Некорректный статус публикации');
        }
        patch.publicationStatus = input.publicationStatus;
      }
      const row = await runTestSetWrite(options, () => setsPort.update(id, patch));
      if (!row) throw new UserFacingError('Набор не найден');
      return row;
    },

    async getTestSetUsage(id: string) {
      return setsPort.getTestSetUsageSummary(id);
    },

    async archiveTestSet(
      id: string,
      options?: ArchiveTestSetOptions,
      writeOptions?: TestSetWriteOptions,
    ) {
      const existing = await setsPort.getById(id);
      if (!existing) throw new TestSetArchiveNotFoundError();
      if (existing.isArchived) throw new TestSetArchiveAlreadyArchivedError();

      const usage = await setsPort.getTestSetUsageSummary(id);
      if (testSetArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new TestSetUsageConfirmationRequiredError(usage);
      }

      const ok = await runTestSetWrite(writeOptions, () => setsPort.archive(id));
      if (!ok) throw new TestSetArchiveNotFoundError();
    },

    async unarchiveTestSet(id: string, options?: TestSetWriteOptions) {
      const existing = await setsPort.getById(id);
      if (!existing) throw new TestSetArchiveNotFoundError();
      if (!existing.isArchived) throw new TestSetUnarchiveNotArchivedError();

      const ok = await runTestSetWrite(options, () => setsPort.unarchive(id));
      if (!ok) throw new TestSetArchiveNotFoundError();
    },

    async setTestSetItems(
      testSetId: string,
      items: TestSetItemInput[],
      options?: TestSetWriteOptions,
    ) {
      const set = await setsPort.getById(testSetId);
      if (!set) throw new UserFacingError('Набор не найден');
      if (set.isArchived) {
        throw new UserFacingError('Набор в архиве. Верните из архива, чтобы менять состав.');
      }

      const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
      const normalized = sorted.map((it, idx) => ({
        testId: it.testId,
        sortOrder: idx,
        comment: it.comment?.trim() ? it.comment.trim() : null,
      }));

      const seen = new Set<string>();
      for (const it of normalized) {
        if (seen.has(it.testId)) {
          throw new UserFacingError('Один и тот же тест не может входить в набор дважды');
        }
        seen.add(it.testId);
      }

      for (const it of normalized) {
        const test = await testsPort.getById(it.testId);
        if (!test) throw new UserFacingError(`Тест не найден: ${it.testId}`);
        if (test.isArchived)
          throw new UserFacingError(`Тест архивирован и не может входить в набор: ${test.title}`);
      }

      await runTestSetWrite(options, () => setsPort.replaceItems(testSetId, normalized));
    },
  };
}

export type ClinicalTestsService = ReturnType<typeof createClinicalTestsService>;
export type TestSetsService = ReturnType<typeof createTestSetsService>;
