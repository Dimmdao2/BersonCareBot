import type { PlatformOrganizationSummary } from '@/modules/org-entitlements/ports';

export const COMMERCIAL_ORG_LIFECYCLE_LABELS: Record<
  PlatformOrganizationSummary['effectiveAccess']['lifecycle'],
  string
> = {
  active: 'Активен',
  grace: 'Льготный период',
  read_only: 'Только чтение',
  blocked: 'Заблокирован',
};

export const COMMERCIAL_TRIAL_STATUS_LABELS: Record<
  NonNullable<PlatformOrganizationSummary['trial']>['status'],
  string
> = {
  active: 'Активен',
  expired: 'Истёк',
  ended: 'Завершён',
};

export function formatCommercialLocaleDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export type CommercialMutationResult = { created?: boolean; endsAt?: string } | null;
export type CommercialMutationResponse = { error?: string; result?: CommercialMutationResult };

export async function postAdminCommercialMutation(
  body: Record<string, unknown>,
): Promise<CommercialMutationResponse> {
  const response = await fetch('/api/admin/commercial', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as CommercialMutationResponse;
  if (!response.ok) throw new Error(payload.error ?? 'commercial_operation_failed');
  return payload;
}
