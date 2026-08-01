'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';

const ERROR_LABELS: Record<string, string> = {
  saas_billing_no_tariff_assigned: 'Тариф ещё не назначен — обратитесь к администратору платформы.',
  saas_billing_payment_provider_unavailable:
    'Оплата тарифа временно недоступна: платёжный магазин платформы не настроен.',
  saas_billing_checkout_unavailable: 'Не удалось получить ссылку на оплату. Попробуйте ещё раз.',
  billing_admin_required: 'Оплату тарифа может запустить только владелец или администратор клиники.',
};

function formatError(code: string | undefined): string {
  return (code && ERROR_LABELS[code]) || 'Не удалось выставить счёт на оплату тарифа.';
}

/** K0 — the one payment element on the tariff screen: issues a checkout link and hands the browser to it. */
export function PayTariffButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/clinic/billing', { method: 'POST' });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; checkoutUrl: string }
        | { ok: false; error?: string }
        | null;
      if (!body || body.ok !== true || !body.checkoutUrl) {
        setError(formatError(body && body.ok === false ? body.error : undefined));
        setPending(false);
        return;
      }
      window.location.href = body.checkoutUrl;
    } catch {
      setError(formatError(undefined));
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button size="sm" onClick={handlePay} disabled={pending}>
        {pending ? 'Готовим ссылку на оплату…' : 'Оплатить тариф'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
