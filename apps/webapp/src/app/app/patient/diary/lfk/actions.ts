'use server';

/**
 * Серверные действия для страницы дневника ЛФК.
 */

import { revalidatePath } from 'next/cache';
import { requirePatientAccessWithPhone } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import { routePaths } from '@/app-layer/routes/paths';
import { logger, serializeError } from '@/infra/logging/logger';

function parseOptionalInt(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

async function patientDiariesRefusal(userId: string): Promise<string | null> {
  const deps = buildAppDeps();
  const tenant = await resolvePatientEnrollmentOrganizationId(
    { patientOrganization: deps.patientOrganization },
    userId,
  );
  if (!tenant.ok) return 'Не удалось определить клинику для записи дневника';
  const entitlement = await requireEntitlementForMutation(
    { organizationId: tenant.organizationId },
    'patient_diaries',
  );
  return entitlement.ok
    ? null
    : entitlementMutationRefusalMessage('добавить, изменить или удалить запись дневника');
}

/** Принимает данные формы, проверяет доступ пациента и комплекс, сохраняет отметку занятия и обновляет страницу. */
export async function markLfkSession(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const session = await requirePatientAccessWithPhone(routePaths.diary);
  const refusal = await patientDiariesRefusal(session.user.userId);
  if (refusal) return { ok: false, message: refusal };
  const complexId = formData.get('complexId');
  if (typeof complexId !== 'string' || !complexId.trim()) {
    return { ok: false };
  }
  const deps = buildAppDeps();
  const complexes = await deps.diaries.listLfkComplexes(session.user.userId);
  if (!complexes.some((c) => c.id === complexId.trim())) {
    return { ok: false };
  }

  const dateRaw = formData.get('sessionDate');
  const timeRaw = formData.get('sessionTime');
  let completedAt = new Date().toISOString();
  if (
    typeof dateRaw === 'string' &&
    dateRaw.trim() &&
    typeof timeRaw === 'string' &&
    timeRaw.trim()
  ) {
    const iso = `${dateRaw.trim()}T${timeRaw.trim()}:00`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      completedAt = d.toISOString();
    }
  }

  const durationMinutes = parseOptionalInt(formData.get('durationMinutes'));
  const difficulty0_10 = parseOptionalInt(formData.get('difficulty0_10'));
  const pain0_10 = parseOptionalInt(formData.get('pain0_10'));
  const commentRaw = formData.get('comment');
  let comment: string | null = typeof commentRaw === 'string' ? commentRaw.trim() : null;
  if (comment && comment.length > 200) {
    comment = comment.slice(0, 200);
  }

  try {
    await deps.diaries.addLfkSession({
      userId: session.user.userId,
      complexId: complexId.trim(),
      source: 'webapp',
      completedAt,
      recordedAt: completedAt,
      durationMinutes,
      difficulty0_10: difficulty0_10 !== null ? Math.min(10, Math.max(0, difficulty0_10)) : null,
      pain0_10: pain0_10 !== null ? Math.min(10, Math.max(0, pain0_10)) : null,
      comment,
    });
  } catch (err) {
    logger.error({ err: serializeError(err) }, 'markLfkSession failed');
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  return { ok: true };
}

/** Patient self-creation of LFK complexes is disabled (complexes come from doctor assignments; see ROADMAP_2 §1.2). */
export async function createLfkComplex(_formData: FormData) {
  await requirePatientAccessWithPhone(routePaths.diary);
  return;
}

export async function updateLfkJournalSession(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const session = await requirePatientAccessWithPhone(routePaths.diaryLfkJournal);
  const refusal = await patientDiariesRefusal(session.user.userId);
  if (refusal) return { ok: false, message: refusal };
  const sessionIdRaw = formData.get('sessionId');
  const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw.trim() : '';
  const completedAtVal = formData.get('completedAt');
  const completedAtRaw = typeof completedAtVal === 'string' ? completedAtVal.trim() : '';
  if (!sessionId || !completedAtRaw) return { ok: false };
  const completedAt = new Date(completedAtRaw);
  if (Number.isNaN(completedAt.getTime())) return { ok: false };

  const durationMinutes = parseOptionalInt(formData.get('durationMinutes'));
  const difficulty0_10 = parseOptionalInt(formData.get('difficulty0_10'));
  const pain0_10 = parseOptionalInt(formData.get('pain0_10'));
  const commentRaw = formData.get('comment');
  let comment: string | null = typeof commentRaw === 'string' ? commentRaw.trim() : null;
  if (comment && comment.length > 200) {
    comment = comment.slice(0, 200);
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;
  const existing = await deps.diaries.getLfkSessionForUser({ userId, sessionId });
  if (!existing) return { ok: false };

  try {
    await deps.diaries.updateLfkSession({
      userId,
      sessionId,
      completedAt: completedAt.toISOString(),
      durationMinutes,
      difficulty0_10: difficulty0_10 !== null ? Math.min(10, Math.max(0, difficulty0_10)) : null,
      pain0_10: pain0_10 !== null ? Math.min(10, Math.max(0, pain0_10)) : null,
      comment,
    });
  } catch (e) {
    logger.error({ err: serializeError(e) }, 'updateLfkJournalSession failed');
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  revalidatePath(routePaths.diaryLfkJournal);
  return { ok: true };
}

export async function deleteLfkJournalSession(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const session = await requirePatientAccessWithPhone(routePaths.diaryLfkJournal);
  const refusal = await patientDiariesRefusal(session.user.userId);
  if (refusal) return { ok: false, message: refusal };
  const sessionIdRaw = formData.get('sessionId');
  const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw.trim() : '';
  if (!sessionId) return { ok: false };
  const deps = buildAppDeps();
  const userId = session.user.userId;
  const existing = await deps.diaries.getLfkSessionForUser({ userId, sessionId });
  if (!existing) return { ok: false };
  try {
    await deps.diaries.deleteLfkSession({ userId, sessionId });
  } catch (e) {
    logger.error({ err: serializeError(e) }, 'deleteLfkJournalSession failed');
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  revalidatePath(routePaths.diaryLfkJournal);
  return { ok: true };
}
