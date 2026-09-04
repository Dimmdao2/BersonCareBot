import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/infra/logging/logger';
import type { ClinicalTestMediaItem, ClinicalTestUsageSnapshot } from '@/modules/tests/types';
import {
  isClinicalTestArchiveAlreadyArchivedError,
  isClinicalTestArchiveNotFoundError,
  isClinicalTestUnarchiveNotArchivedError,
  isClinicalTestUsageConfirmationRequiredError,
} from '@/modules/tests/errors';
import {
  clinicalTestScoringSchema,
  normalizeClinicalTestScoringOrder,
} from '@/modules/tests/clinicalTestScoring';
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from '@/shared/lib/mediaUrlPolicy';
import { safeActionErrorText } from '@/app-layer/errors/safeUserError';

export type SaveClinicalTestState = { ok: boolean; error?: string };

export type ArchiveClinicalTestState =
  | { ok: true }
  | { ok: false; code: 'USAGE_CONFIRMATION_REQUIRED'; usage: ClinicalTestUsageSnapshot }
  | { ok: false; error: string };

export type ArchiveClinicalTestCoreResult =
  | { kind: 'archived'; id: string }
  | { kind: 'needs_confirmation'; usage: ClinicalTestUsageSnapshot }
  | { kind: 'invalid'; error: string };

export type UnarchiveClinicalTestState = { ok: true } | { ok: false; error: string };

export type UnarchiveClinicalTestCoreResult =
  { kind: 'unarchived'; id: string } | { kind: 'invalid'; error: string };

function parseAcknowledgeUsageWarning(fd: FormData): boolean {
  const v = fd.get('acknowledgeUsageWarning');
  return v === '1' || v === 'true' || v === 'on';
}

export { CLINICAL_TESTS_PATH } from './paths';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBodyRegionIdsFromFormData(fd: FormData, fieldName: string): string[] {
  const raw = fd.getAll(fieldName);
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (!UUID_RE.test(t)) continue;
    out.push(t);
  }
  return [...new Set(out)];
}

function parseTags(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function validateMedia(
  mediaUrl: string | null,
  mediaType: 'image' | 'video' | 'gif' | '',
): string | null {
  if (mediaType && !mediaUrl) return 'Укажите файл из библиотеки или очистите тип медиа.';
  if (mediaUrl && !mediaType) return 'Выберите файл из библиотеки.';
  if (mediaUrl && !(API_MEDIA_URL_RE.test(mediaUrl) || isLegacyAbsoluteUrl(mediaUrl))) {
    return 'Медиа должно быть из библиотеки (/api/media/…) или допустимый URL.';
  }
  return null;
}

export async function saveClinicalTestCore(
  formData: FormData,
): Promise<{ ok: true; testId: string; wasUpdate: boolean } | { ok: false; error: string }> {
  const workspace = await requireDoctorWorkspaceContext();

  const idRaw = formData.get('id');
  const titleField = formData.get('title');
  const title = typeof titleField === 'string' ? titleField.trim() : '';
  const descField = formData.get('description');
  const description = typeof descField === 'string' ? descField.trim() : '';
  const testTypeField = formData.get('testType');
  const testType = typeof testTypeField === 'string' ? testTypeField.trim() : '';

  const rawTextField = formData.get('rawText');
  const rawText =
    typeof rawTextField === 'string' ? (rawTextField.trim() ? rawTextField.trim() : null) : null;

  const deps = buildAppDeps();
  const allowRegions = new Set(
    (await deps.references.listActiveItemsByCategoryCode('body_region')).map((i) => i.id),
  );
  const bodyRegionIds = parseBodyRegionIdsFromFormData(formData, 'bodyRegionIds').filter((id) =>
    allowRegions.has(id),
  );

  const assessmentField = formData.get('assessmentKind');
  const assessmentTrim = typeof assessmentField === 'string' ? assessmentField.trim() : '';
  const assessmentKind = assessmentTrim || null;

  const editorMode = formData.get('scoringEditorMode');
  const jsonMode = editorMode === 'json';

  let scoringParsed: ReturnType<typeof normalizeClinicalTestScoringOrder> | null = null;
  if (jsonMode) {
    const rawJson = formData.get('scoringJsonRaw');
    if (typeof rawJson === 'string' && rawJson.trim()) {
      try {
        const parsed = JSON.parse(rawJson) as unknown;
        const r = clinicalTestScoringSchema.safeParse(parsed);
        if (!r.success) return { ok: false, error: 'Некорректный JSON scoring' };
        scoringParsed = normalizeClinicalTestScoringOrder(r.data);
      } catch {
        return { ok: false, error: 'Некорректный JSON scoring' };
      }
    }
  } else {
    const payload = formData.get('clinicalScoringJson');
    if (typeof payload === 'string' && payload.trim()) {
      try {
        const parsed = JSON.parse(payload) as unknown;
        const r = clinicalTestScoringSchema.safeParse(parsed);
        if (!r.success) return { ok: false, error: 'Некорректная структура scoring' };
        scoringParsed = normalizeClinicalTestScoringOrder(r.data);
      } catch {
        return { ok: false, error: 'Некорректная структура scoring' };
      }
    }
  }

  const scoring = scoringParsed;

  const mediaUrlField = formData.get('mediaUrl');
  const mediaUrl = typeof mediaUrlField === 'string' ? mediaUrlField.trim() : '';
  const mediaTypeField = formData.get('mediaType');
  const mediaTypeRaw = typeof mediaTypeField === 'string' ? mediaTypeField.trim() : '';
  const mediaType =
    mediaTypeRaw === 'image' || mediaTypeRaw === 'video' || mediaTypeRaw === 'gif'
      ? mediaTypeRaw
      : ('' as const);

  const mediaErr = validateMedia(mediaUrl || null, mediaType);
  if (mediaErr) return { ok: false, error: mediaErr };

  const media: ClinicalTestMediaItem[] = [];
  if (mediaUrl && mediaType) {
    media.push({ mediaUrl, mediaType, sortOrder: 0 });
  }

  const tags = parseTags(formData.get('tags'));

  if (!title) return { ok: false, error: 'Название обязательно' };

  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : '';

  try {
    if (id) {
      const cur = await deps.clinicalTests.getClinicalTest(id);
      if (!cur) return { ok: false, error: 'Тест не найден' };
      if (cur.isArchived) {
        return { ok: false, error: 'Тест в архиве. Верните из архива, чтобы редактировать.' };
      }
      await deps.clinicalTests.updateClinicalTest(
        id,
        {
          title,
          description: description || null,
          testType: testType || null,
          assessmentKind,
          bodyRegionIds,
          scoring,
          rawText,
          tags,
          media,
        },
        {
          runClinicalTestWrite: (fn) =>
            withDoctorWorkspacePrincipal(workspace, 'doctor.clinical-tests.update', fn),
        },
      );
      return { ok: true, testId: id, wasUpdate: true };
    }
    const row = await deps.clinicalTests.createClinicalTest(
      {
        title,
        description: description || null,
        testType: testType || null,
        assessmentKind,
        bodyRegionIds,
        scoring,
        rawText,
        tags,
        media,
      },
      workspace.session.user.userId,
      {
        runClinicalTestWrite: (fn) =>
          withDoctorWorkspacePrincipal(workspace, 'doctor.clinical-tests.create', fn),
      },
    );
    return { ok: true, testId: row.id, wasUpdate: false };
  } catch (e) {
    return {
      ok: false,
      error: safeActionErrorText('app/doctor/clinical-tests', e, 'Ошибка сохранения'),
    };
  }
}

export async function archiveClinicalTestCore(
  formData: FormData,
): Promise<ArchiveClinicalTestCoreResult> {
  const workspace = await requireDoctorWorkspaceContext();
  const idRaw = formData.get('id');
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : '';
  if (!id) return { kind: 'invalid', error: 'Не указан тест' };

  const acknowledgeUsageWarning = parseAcknowledgeUsageWarning(formData);
  const deps = buildAppDeps();
  try {
    await deps.clinicalTests.archiveClinicalTest(
      id,
      { acknowledgeUsageWarning },
      {
        runClinicalTestWrite: (fn) =>
          withDoctorWorkspacePrincipal(workspace, 'doctor.clinical-tests.archive', fn),
      },
    );
    return { kind: 'archived', id };
  } catch (e) {
    if (isClinicalTestUsageConfirmationRequiredError(e)) {
      return { kind: 'needs_confirmation', usage: e.usage };
    }
    if (isClinicalTestArchiveNotFoundError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    if (isClinicalTestArchiveAlreadyArchivedError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    logger.warn(
      { event: 'doctor_clinical_test_archive_unexpected_error', clinicalTestId: id, err: e },
      'archive failed',
    );
    return { kind: 'invalid', error: 'Не удалось архивировать тест' };
  }
}

export async function unarchiveClinicalTestCore(
  formData: FormData,
): Promise<UnarchiveClinicalTestCoreResult> {
  const workspace = await requireDoctorWorkspaceContext();
  const idRaw = formData.get('id');
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : '';
  if (!id) return { kind: 'invalid', error: 'Не указан тест' };

  const deps = buildAppDeps();
  try {
    await deps.clinicalTests.unarchiveClinicalTest(id, {
      runClinicalTestWrite: (fn) =>
        withDoctorWorkspacePrincipal(workspace, 'doctor.clinical-tests.unarchive', fn),
    });
    return { kind: 'unarchived', id };
  } catch (e) {
    if (isClinicalTestArchiveNotFoundError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    if (isClinicalTestUnarchiveNotArchivedError(e)) {
      return { kind: 'invalid', error: e.message };
    }
    logger.warn(
      { event: 'doctor_clinical_test_unarchive_unexpected_error', clinicalTestId: id, err: e },
      'unarchive failed',
    );
    return { kind: 'invalid', error: 'Не удалось вернуть тест из архива' };
  }
}
