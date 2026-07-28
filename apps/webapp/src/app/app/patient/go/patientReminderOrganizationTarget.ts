import { z } from 'zod';
import { routePaths } from '@/app-layer/routes/paths';

const organizationIdSchema = z.string().uuid();

export function parsePatientReminderOrganizationTarget(raw: string | undefined): string | null {
  const parsed = organizationIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function buildPatientReminderOrganizationOpener(
  kind: 'daily-warmup' | 'plan-start-lesson',
  organizationId: string,
): string {
  const search = new URLSearchParams({
    kind: 'organization_go',
    organizationId,
    goKind: kind,
  });
  return `/api/patient/organization-context/open?${search.toString()}`;
}

export function buildPatientReminderContinuation(
  kind: 'daily-warmup' | 'plan-start-lesson',
  organizationId: string,
): string {
  const path =
    kind === 'daily-warmup' ? routePaths.patientGoDailyWarmup : routePaths.patientGoPlanStartLesson;
  const search = new URLSearchParams({ from: 'reminder', organizationId });
  return `${path}?${search.toString()}`;
}

export function patientOrganizationRecoveryPath(
  reason: 'reminder_target_missing' | 'organization_unavailable',
): string {
  return `${routePaths.patientOrganizations}?reason=${reason}`;
}
