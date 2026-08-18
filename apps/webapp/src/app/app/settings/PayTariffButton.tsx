'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/doctor/primitives/select';
import { SAAS_BILLING_TARIFF_NOT_PAYABLE } from '@/modules/saas-billing/payableTariff';

/**
 * Решение владельца 18.08.2026: «Считать бесплатный тариф неоплачиваемым». Одна фраза и на экране
 * вместо кнопки, и на отказ маршрута — правило одно (`modules/saas-billing/payableTariff.ts`).
 */
const FREE_TARIFF_LABEL = 'Тариф бесплатный — платить нечего.';

const ERROR_LABELS: Record<string, string> = {
  [SAAS_BILLING_TARIFF_NOT_PAYABLE]: FREE_TARIFF_LABEL,
  saas_billing_no_tariff_assigned: 'Тариф ещё не назначен — обратитесь к администратору платформы.',
  saas_billing_payment_provider_unavailable:
    'Оплата тарифа временно недоступна: платёжный магазин платформы не настроен.',
  saas_billing_checkout_unavailable: 'Не удалось получить ссылку на оплату. Попробуйте ещё раз.',
  billing_admin_required: 'Оплату тарифа может запустить только владелец или администратор клиники.',
  saas_billing_tariff_downgrade_blocked: 'Понижение недоступно: сначала приведите клинику к новому тарифу.',
  saas_billing_tariff_upgrade_proration_unavailable:
    'Повышение с разными валютами или периодами пока нельзя рассчитать автоматически.',
  saas_billing_tariff_upgrade_not_more_expensive: 'Этот тариф не является повышением.',
  saas_billing_upgrade_no_remaining_period: 'Оплаченный период уже завершился. Оформите следующий период.',
  saas_billing_no_active_paid_subscription: 'Для смены тарифа нужен действующий оплаченный период.',
  saas_billing_receipt_email_missing: 'Укажите email для чека и сохраните его.',
  saas_billing_receipt_vat_code_missing:
    'Оплата пока недоступна: администратор платформы должен указать ставку НДС для чека.',
};

function formatError(code: string | undefined): string {
  return (code && ERROR_LABELS[code]) || 'Не удалось выставить счёт на оплату тарифа.';
}

const DOWNGRADE_BLOCK_LABELS: Record<string, string> = {
  clinic_team: 'места специалистов',
  branches: 'филиалы',
  patient_count: 'пациенты',
};

function formatTariffChangeError(body: { error?: string; blocks?: Array<{ mechanic?: string }> } | null): string {
  const labels = body?.blocks
    ?.map((block) => (block.mechanic ? DOWNGRADE_BLOCK_LABELS[block.mechanic] : undefined))
    .filter((label): label is string => Boolean(label));
  if (body?.error === 'saas_billing_tariff_downgrade_blocked' && labels?.length) {
    return `Понижение недоступно: освободите ${labels.join(', ')}.`;
  }
  return formatError(body?.error);
}

/** K0 — the one payment element on the tariff screen: issues a checkout link and hands the browser to it. */
export type ClinicTariffChangeState = {
  choices: Array<{ id: string; name: string }>;
  currentTariffId: string | null;
  pendingTariffId: string | null;
  pendingEffectiveAt: string | null;
  /** `false` for a tariff priced at zero — the server decides this, the screen only obeys it. */
  payable: boolean;
};

export function PayTariffButton({
  tariffChange,
  billingEmail: initialBillingEmail,
}: {
  tariffChange: ClinicTariffChangeState;
  billingEmail: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTariffId, setSelectedTariffId] = useState(
    tariffChange.pendingTariffId ?? tariffChange.currentTariffId ?? '',
  );
  const [pendingTariffId, setPendingTariffId] = useState(tariffChange.pendingTariffId);
  const [billingEmail, setBillingEmail] = useState(initialBillingEmail ?? '');
  const [savedBillingEmail, setSavedBillingEmail] = useState(initialBillingEmail ?? '');

  async function saveBillingEmail() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'billing_contact', billingEmail }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; billingEmail: string }
        | { ok: false; error?: string }
        | null;
      if (!body?.ok) setError('Проверьте email для чека.');
      else {
        setBillingEmail(body.billingEmail);
        setSavedBillingEmail(body.billingEmail);
      }
    } catch {
      setError('Не удалось сохранить email для чека.');
    } finally {
      setPending(false);
    }
  }

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

  async function changeTariff() {
    if (!selectedTariffId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tariffId: selectedTariffId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; blocks?: Array<{ mechanic?: string }>; checkoutUrl?: string }
        | null;
      if (!body?.ok) setError(formatTariffChangeError(body));
      else if (body.checkoutUrl) window.location.href = body.checkoutUrl;
      else setPendingTariffId(selectedTariffId === tariffChange.currentTariffId ? null : selectedTariffId);
    } catch {
      setError(formatError(undefined));
    } finally {
      setPending(false);
    }
  }

  async function cancelChange() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/clinic/billing', { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!body?.ok) setError(formatError(body?.error));
      else {
        setPendingTariffId(null);
        setSelectedTariffId(tariffChange.currentTariffId ?? '');
      }
    } catch {
      setError(formatError(undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="saas-billing-email">Email для чека</Label>
          <Input
            id="saas-billing-email"
            type="email"
            value={billingEmail}
            onChange={(event) => setBillingEmail(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={saveBillingEmail}
          disabled={
            pending ||
            !billingEmail.trim() ||
            billingEmail.trim().toLowerCase() === savedBillingEmail
          }
        >
          Сохранить
        </Button>
      </div>
      <Select value={selectedTariffId} onValueChange={(value) => setSelectedTariffId(value ?? '')}>
        <SelectTrigger
          className="w-full"
          displayLabel={tariffChange.choices.find((choice) => choice.id === selectedTariffId)?.name}
        />
        <SelectContent>
          {tariffChange.choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id} label={choice.name}>
              {choice.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={changeTariff} disabled={pending || !selectedTariffId}>
        {selectedTariffId === tariffChange.currentTariffId
          ? 'Отменить запланированную смену'
          : 'Перейти на тариф'}
      </Button>
      {pendingTariffId && tariffChange.pendingEffectiveAt ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Новый тариф вступит {new Date(tariffChange.pendingEffectiveAt).toLocaleDateString('ru-RU')}</span>
          <Button size="sm" variant="ghost" onClick={cancelChange} disabled={pending}>Отменить</Button>
        </div>
      ) : null}
      {tariffChange.payable ? (
        <Button
          size="sm"
          onClick={handlePay}
          disabled={
            pending ||
            !savedBillingEmail ||
            billingEmail.trim().toLowerCase() !== savedBillingEmail
          }
        >
          {pending ? 'Готовим ссылку на оплату…' : 'Оплатить тариф'}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{FREE_TARIFF_LABEL}</p>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
