'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type { SaasBillingSubscriptionReadRow } from '@/modules/saas-billing/ports';

const ERROR_LABELS: Record<string, string> = {
  saas_billing_no_tariff_assigned: 'Тариф ещё не назначен — обратитесь к администратору платформы.',
  saas_billing_no_active_paid_subscription: 'Отменять пока нечего — оплаченного периода ещё нет.',
  billing_admin_required: 'Отменить подписку может только владелец или администратор клиники.',
};

function formatError(code: string | undefined): string {
  return (code && ERROR_LABELS[code]) || 'Не удалось отменить подписку. Попробуйте ещё раз.';
}

/**
 * F-6 (independent audit-live, 2026-09-05) — the clinic's own "cancel the subscription" control.
 * #1069 owner decision 2026-09-05 (period grid): cancellation only stops future
 * renewal/autopay — the already-paid period keeps working through `currentPeriodEndsAt`, which is
 * why this never removes/changes the tariff picker above it (`PayTariffButton`) and never touches
 * `pendingTariffId` (that is a DIFFERENT cancel — see the "Отменить запланированную смену" button).
 */
export function CancelSubscriptionButton({
  subscription,
}: {
  subscription: Pick<SaasBillingSubscriptionReadRow, 'cancelledAt' | 'currentPeriodEndsAt'> | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelledAt, setCancelledAt] = useState(subscription?.cancelledAt ?? null);

  if (!subscription) return null;

  async function handleCancel() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_subscription' }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null;
      if (!body?.ok) {
        setError(formatError(body?.error));
        return;
      }
      setCancelledAt(new Date().toISOString());
    } catch {
      setError(formatError(undefined));
    } finally {
      setPending(false);
    }
  }

  if (cancelledAt) {
    return (
      <p className="text-xs text-muted-foreground">
        {subscription.currentPeriodEndsAt
          ? `Подписка не будет продлена — доступ сохранится до ${new Date(
              subscription.currentPeriodEndsAt,
            ).toLocaleDateString('ru-RU')}.`
          : 'Подписка не будет продлена.'}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button size="sm" variant="ghost" onClick={handleCancel} disabled={pending}>
        {pending ? 'Отменяем…' : 'Отменить подписку'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
