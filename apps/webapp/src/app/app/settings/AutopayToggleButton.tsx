'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { SAAS_BILLING_AUTOPAY_CONSENT_TEXT } from '@/modules/saas-billing/autopayConsent';
import type { SaasBillingSubscriptionReadRow } from '@/modules/saas-billing/ports';

const ERROR_LABELS: Record<string, string> = {
  saas_billing_no_tariff_assigned: 'Тариф ещё не назначен — обратитесь к администратору платформы.',
  billing_admin_required: 'Включить или отключить автосписание может только владелец или администратор клиники.',
};

function formatError(code: string | undefined): string {
  return (code && ERROR_LABELS[code]) || 'Не удалось изменить автосписание. Попробуйте ещё раз.';
}

async function postAutopay(path: 'consent' | 'revoke'): Promise<string | null> {
  try {
    const response = await fetch(`/api/clinic/billing/autopay/${path}`, { method: 'POST' });
    const body = (await response.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; error?: string }
      | null;
    if (!body || body.ok !== true) {
      return formatError(body && body.ok === false ? body.error : undefined);
    }
    return null;
  } catch {
    return formatError(undefined);
  }
}

/**
 * К6 — the ONE autopay control on the tariff screen. `active` (consent granted and not revoked)
 * decides which side of the toggle shows; the saved-method line only appears once the provider has
 * actually confirmed one (`savedPaymentMethodId`), which happens on a later `payment.succeeded`
 * webhook, never at consent-grant time.
 */
export function AutopayToggleButton({
  subscription,
}: {
  subscription: Pick<
    SaasBillingSubscriptionReadRow,
    'autopayConsentedAt' | 'autopayRevokedAt' | 'savedPaymentMethodId'
  > | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active =
    subscription?.autopayConsentedAt != null && subscription.autopayRevokedAt == null;

  async function handleToggle() {
    setPending(true);
    setError(null);
    const failure = await postAutopay(active ? 'revoke' : 'consent');
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Автосписание</span>
        <Badge variant={active ? 'secondary' : 'outline'}>{active ? 'Включено' : 'Выключено'}</Badge>
      </div>
      {!active && <p className="text-xs text-muted-foreground">{SAAS_BILLING_AUTOPAY_CONSENT_TEXT}</p>}
      {active && !subscription?.savedPaymentMethodId && (
        <p className="text-xs text-muted-foreground">
          Сохранённого способа оплаты пока нет — он появится после следующего успешного платежа.
        </p>
      )}
      <Button size="sm" variant={active ? 'outline' : 'default'} onClick={handleToggle} disabled={pending}>
        {pending ? 'Сохраняем…' : active ? 'Отключить автосписание' : 'Включить автосписание'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
