'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SaasBillingInvoiceStatus,
  SaasBillingPlatformBreakdownRow,
  SaasBillingPlatformInvoiceRow,
  SaasBillingPlatformSummary,
  SaasBillingReconciliationDiscrepancy,
  SaasBillingRefund,
} from '@/modules/saas-billing/ports';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/doctor/primitives/card';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import { apiJson } from '@/shared/lib/apiJson';

const INVOICE_STATUS_LABELS: Record<SaasBillingInvoiceStatus, string> = {
  draft: 'Черновик',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
  void: 'Аннулирован',
};

function statusBadgeVariant(
  status: SaasBillingInvoiceStatus,
): 'secondary' | 'outline' | 'destructive' {
  if (status === 'paid') return 'secondary';
  if (status === 'failed' || status === 'void') return 'destructive';
  return 'outline';
}

/**
 * К4 — "просрочен" is never a stored status: derived here from `expiresAt` vs now, only for a row
 * still awaiting payment. See PAYMENTS_CABINET_PLAN.md К4 item 3.
 */
function isInvoiceOverdue(row: SaasBillingPlatformInvoiceRow): boolean {
  return (
    (row.status === 'draft' || row.status === 'pending') &&
    row.expiresAt !== null &&
    new Date(row.expiresAt).getTime() < Date.now()
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

const REFUND_ERROR_LABELS: Record<string, string> = {
  invoice_not_found: 'Платёж не найден.',
  invoice_not_refundable: 'Возврат недоступен: платёж ещё не оплачен.',
  amount_exceeds_remaining: 'Сумма превышает остаток по платежу.',
  provider_error: 'Провайдер не принял возврат. Попробуйте ещё раз.',
  invalid_refund_request: 'Некорректная сумма возврата.',
  forbidden: 'Нет прав на возврат.',
  unauthorized: 'Сессия истекла — войдите заново.',
};

function refundErrorLabel(code: string): string {
  return REFUND_ERROR_LABELS[code] ?? `Возврат не выполнен (${code}).`;
}

// К4 — manual invoice: issued from the cabinet via YooKassa's /v3/invoices, distinct from the
// self-serve renewal checkout (createIntent). See PAYMENTS_CABINET_PLAN.md К4.
const MANUAL_INVOICE_ERROR_LABELS: Record<string, string> = {
  saas_billing_no_tariff_assigned: 'У клиники нет назначенного тарифа — сначала назначьте его.',
  saas_billing_manual_invoice_amount_must_be_positive_integer: 'Сумма должна быть больше нуля.',
  saas_billing_manual_invoice_description_required: 'Укажите, за что счёт.',
  saas_billing_manual_invoice_expiry_invalid: 'Срок действия должен быть в будущем.',
  saas_billing_payment_provider_unavailable: 'У провайдера нет рабочих ключей для платформенного магазина.',
  saas_billing_provider_invoices_unsupported: 'Выбранный провайдер не поддерживает выставление счетов.',
  saas_billing_provider_rejected_invoice: 'Провайдер отклонил выставление счёта.',
  saas_billing_checkout_unavailable: 'Провайдер не вернул ссылку на оплату.',
  invalid_manual_invoice_request: 'Проверьте заполнение формы.',
  forbidden: 'Нет прав на выставление счёта.',
  unauthorized: 'Сессия истекла — войдите заново.',
};

function manualInvoiceErrorLabel(code: string): string {
  return MANUAL_INVOICE_ERROR_LABELS[code] ?? `Счёт не выставлен (${code}).`;
}

const CANCEL_ERROR_LABELS: Record<string, string> = {
  invoice_not_found: 'Счёт не найден.',
  invoice_not_cancellable: 'Счёт уже оплачен или уже отменён — отменить нельзя.',
  forbidden: 'Нет прав на отмену.',
  unauthorized: 'Сессия истекла — войдите заново.',
};

function cancelErrorLabel(code: string): string {
  return CANCEL_ERROR_LABELS[code] ?? `Счёт не отменён (${code}).`;
}

function formatAmount(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${new Intl.NumberFormat('ru-RU').format(amountMinor / 100)} ${currency}`;
  }
}

const BILLING_PERIOD_LABELS: Record<'day' | 'month' | 'year', string> = {
  day: 'день',
  month: 'месяц',
  year: 'год',
};

type SummaryApiResponse =
  | { ok: true; summary: SaasBillingPlatformSummary; breakdown: SaasBillingPlatformBreakdownRow[] }
  | { ok: false; error?: string };

type ReconcileOkResult = {
  providerId: string;
  periodFrom: string;
  periodTo: string;
  checkedAt: string;
  journalCount: number;
  providerCount: number;
  truncated: boolean;
  discrepancies: SaasBillingReconciliationDiscrepancy[];
};

type ReconcileApiResponse =
  | { ok: true; result: ReconcileOkResult }
  | { ok: false; error?: string; providerId?: string };

/**
 * К3 item 1/2 — deliberately filtered by period+payer only, NOT status: it always shows all four
 * buckets for the period the list below is scoped to, regardless of which status the list itself is
 * currently narrowed to (see the route's own comment for why).
 */
function PlatformPaymentsSummarySection({
  periodFrom,
  periodTo,
  payer,
}: {
  periodFrom: string;
  periodTo: string;
  payer: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SaasBillingPlatformSummary | null>(null);
  const [breakdown, setBreakdown] = useState<SaasBillingPlatformBreakdownRow[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (periodFrom) params.set('from', periodFrom);
    if (periodTo) params.set('to', periodTo);
    if (payer.trim()) params.set('payer', payer.trim());
    try {
      const json = await apiJson<SummaryApiResponse>(
        `/api/admin/saas-billing/payments/summary?${params.toString()}`,
        { credentials: 'include' },
      );
      if (json.ok) {
        setSummary(json.summary);
        setBreakdown(json.breakdown);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network');
    } finally {
      setLoading(false);
    }
  }, [periodFrom, periodTo, payer]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-muted-foreground">Загрузка сводки…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Сводка не загрузилась ({error}).
      </p>
    );
  }
  if (!summary || summary.byCurrency.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">За этот период платежей нет — сводка пуста.</p>
    );
  }

  return (
    <div className="space-y-4">
      {summary.byCurrency.map((row) => (
        <div key={row.currency} className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ['Принято', row.received],
              ['Возвращено', row.refunded],
              ['В обработке', row.inProcess],
              ['Не оплачено', row.unpaid],
            ] as const
          ).map(([label, bucket]) => (
            <div key={label} className="rounded-md border border-border/60 p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold">
                {formatAmount(bucket.amountMinor, row.currency)}
              </div>
              <div className="text-xs text-muted-foreground">{bucket.count} шт.</div>
            </div>
          ))}
        </div>
      ))}

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
          Разрез по тарифам
        </div>
        {!breakdown || breakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Оплаченных счетов за период нет — разрез по тарифам пуст.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Тариф</th>
                  <th className="px-3 py-2 font-medium">Период подписки</th>
                  <th className="px-3 py-2 font-medium">Оплат</th>
                  <th className="px-3 py-2 font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr
                    key={`${row.tariffId}:${row.tariffBillingPeriod}:${row.currency}`}
                    className="border-t border-border/50"
                  >
                    <td className="px-3 py-2">{row.tariffName}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {BILLING_PERIOD_LABELS[row.tariffBillingPeriod]}
                    </td>
                    <td className="px-3 py-2">{row.count}</td>
                    <td className="px-3 py-2 font-medium">
                      {formatAmount(row.amountMinor, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const RECONCILE_DISCREPANCY_LABELS: Record<SaasBillingReconciliationDiscrepancy['kind'], string> = {
  missing_in_provider: 'Есть у нас — нет у провайдера',
  missing_in_journal: 'Есть у провайдера — нет у нас',
  amount_mismatch: 'Суммы расходятся',
};

function ReconciliationDiscrepancyRow({
  discrepancy,
}: {
  discrepancy: SaasBillingReconciliationDiscrepancy;
}) {
  if (discrepancy.kind === 'missing_in_provider') {
    return (
      <tr className="border-t border-border/50">
        <td className="px-3 py-2">{RECONCILE_DISCREPANCY_LABELS[discrepancy.kind]}</td>
        <td className="px-3 py-2">{discrepancy.organizationTitle}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {discrepancy.providerInvoiceRef}
        </td>
        <td className="px-3 py-2">{formatAmount(discrepancy.amountMinor, discrepancy.currency)}</td>
      </tr>
    );
  }
  if (discrepancy.kind === 'missing_in_journal') {
    return (
      <tr className="border-t border-border/50">
        <td className="px-3 py-2">{RECONCILE_DISCREPANCY_LABELS[discrepancy.kind]}</td>
        <td className="px-3 py-2 text-muted-foreground">—</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {discrepancy.providerPaymentRef} ({discrepancy.providerStatus})
        </td>
        <td className="px-3 py-2">{formatAmount(discrepancy.amountMinor, discrepancy.currency)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-border/50">
      <td className="px-3 py-2">{RECONCILE_DISCREPANCY_LABELS[discrepancy.kind]}</td>
      <td className="px-3 py-2">{discrepancy.organizationTitle}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{discrepancy.providerInvoiceRef}</td>
      <td className="px-3 py-2">
        у нас: {formatAmount(discrepancy.journalAmountMinor, discrepancy.journalCurrency)}, у
        провайдера: {formatAmount(discrepancy.providerAmountMinor, discrepancy.providerCurrency)}
      </td>
    </tr>
  );
}

const RECONCILE_ERROR_LABELS: Record<string, string> = {
  provider_unavailable: 'Провайдер не умеет отдавать список платежей — сверка недоступна.',
  provider_error: 'Провайдер недоступен. Попробуйте ещё раз позже.',
  invalid_reconcile_request: 'Укажите период (с и по) для сверки.',
  unauthorized: 'Сессия истекла — войдите заново.',
  forbidden: 'Нет прав на сверку.',
};

function reconcileErrorLabel(code: string): string {
  return RECONCILE_ERROR_LABELS[code] ?? `Сверка не выполнена (${code}).`;
}

/**
 * К3 item 3/4 — runs only on button press (never on render/mount): this is an external call to the
 * provider, not a display of our own data. Read-only — it never writes back to the journal.
 */
function ReconciliationSection({
  initialFrom,
  initialTo,
}: {
  initialFrom: string;
  initialTo: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileOkResult | null>(null);

  const run = useCallback(async () => {
    if (!from || !to) {
      setError(reconcileErrorLabel('invalid_reconcile_request'));
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const json = await apiJson<ReconcileApiResponse>(
        '/api/admin/saas-billing/payments/reconcile',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
        },
      );
      if (json.ok) setResult(json.result);
    } catch (e) {
      setError(reconcileErrorLabel(e instanceof Error ? e.message : 'network'));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [from, to]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Сверка с провайдером</CardTitle>
        <CardDescription>
          Список платежей ЮKassa за период (`GET /v3/payments`) против нашего журнала. Ничего не
          дописывает в журнал — только показывает расхождения.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="reconcile-from">Период с</Label>
            <Input
              id="reconcile-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reconcile-to">Период по</Label>
            <Input
              id="reconcile-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={run} disabled={running} className="w-full sm:w-auto">
              {running ? 'Сверяем…' : 'Сверить с провайдером'}
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              У нас: {result.journalCount} платежей, у провайдера: {result.providerCount}.
              {result.truncated &&
                ' Список провайдера обрезан по лимиту страниц — сверка неполная.'}
            </p>
            {result.discrepancies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Расхождений нет — журнал сходится с провайдером.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Расхождение</th>
                      <th className="px-3 py-2 font-medium">Плательщик</th>
                      <th className="px-3 py-2 font-medium">Ссылка провайдера</th>
                      <th className="px-3 py-2 font-medium">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.discrepancies.map((d, i) => (
                      <ReconciliationDiscrepancyRow key={i} discrepancy={d} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type FilterState = {
  status: '' | SaasBillingInvoiceStatus;
  from: string;
  to: string;
  payer: string;
};

const emptyFilters = (): FilterState => ({ status: '', from: '', to: '', payer: '' });

type ApiResponse =
  | { ok: true; payments: SaasBillingPlatformInvoiceRow[] }
  | { ok: false; error?: string };

type RefundApiResponse =
  | { ok: true; refund: SaasBillingRefund; duplicate: boolean }
  | { ok: false; error?: string };

/**
 * К2 — "в обработке" until the provider webhook confirms the refund (plan requirement: never show
 * "возвращено" before that). `remainingMinor` excludes both confirmed and pending refunds, so a
 * second partial refund can't be requested for more than what a first one has already reserved.
 */
function RefundCell({
  row,
  onOpenRefund,
}: {
  row: SaasBillingPlatformInvoiceRow;
  onOpenRefund: () => void;
}) {
  const remainingMinor = row.amountMinor - row.refundedMinor - row.pendingRefundMinor;

  if (row.status !== 'paid') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-1">
      {row.pendingRefundMinor > 0 && (
        <div className="text-xs text-muted-foreground">
          В обработке: {formatAmount(row.pendingRefundMinor, row.currency)}
        </div>
      )}
      {row.refundedMinor > 0 && (
        <div className="text-xs text-muted-foreground">
          Возвращено: {formatAmount(row.refundedMinor, row.currency)}
        </div>
      )}
      {remainingMinor > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={onOpenRefund}>
          Возврат
        </Button>
      )}
    </div>
  );
}

function RefundDialog({
  row,
  onClose,
  onSuccess,
}: {
  row: SaasBillingPlatformInvoiceRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const remainingMinor = row.amountMinor - row.refundedMinor - row.pendingRefundMinor;
  // Generated once per dialog instance (i.e. once per открытие) and reused for every submit
  // attempt of THIS dialog — a repeated click while a request is in flight, or a resubmit after a
  // transient error, carries the same key, so the server treats it as the same refund attempt.
  const [requestKey] = useState(() => crypto.randomUUID());
  const [amountRub, setAmountRub] = useState((remainingMinor / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const amountMinor = Math.round(Number.parseFloat(amountRub.replace(',', '.')) * 100);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      setError('Введите сумму больше нуля.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const json = await apiJson<RefundApiResponse>(
        `/api/admin/saas-billing/payments/${row.id}/refund`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountMinor, requestKey, reason }),
        },
      );
      if (json.ok) onSuccess();
    } catch (e) {
      setError(refundErrorLabel(e instanceof Error ? e.message : 'network'));
    } finally {
      setSubmitting(false);
    }
  }, [amountRub, reason, requestKey, row.id, onSuccess]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Возврат — {row.organizationTitle}</DialogTitle>
          <DialogDescription>
            {row.tariffName}, оплачено {formatAmount(row.amountMinor, row.currency)}. Остаток к
            возврату: {formatAmount(remainingMinor, row.currency)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="refund-amount">Сумма возврата, {row.currency}</Label>
            <Input
              id="refund-amount"
              type="number"
              min="0.01"
              max={(remainingMinor / 100).toFixed(2)}
              step="0.01"
              value={amountRub}
              onChange={(e) => setAmountRub(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Причина (необязательно)</Label>
            <Input
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? 'Отправка…' : 'Вернуть'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type OrganizationOption = { id: string; title: string; tariffId: string | null };
type TariffOption = {
  id: string;
  name: string;
  priceMinor: number | null;
  currency: string | null;
  billingPeriod: 'day' | 'month' | 'year';
};

/** `datetime-local` input value, three days out — a visible, editable default, not a hidden one. */
function defaultExpiresAtLocal(): string {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ManualInvoiceApiResponse =
  | { ok: true; invoice: SaasBillingPlatformInvoiceRow }
  | { ok: false; error?: string };

/**
 * К4 — form: клиника, сумма, за что, срок действия. Selecting a clinic prefills amount/currency/
 * description from ITS OWN assigned tariff (visible, editable) — the defaults are shown, not hidden,
 * per plan К4 item 1. On success the returned checkout link is shown so the admin can copy it to the
 * clinic; the list only reloads once the dialog is dismissed, so the link stays visible meanwhile.
 */
function ManualInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [organizations, setOrganizations] = useState<OrganizationOption[] | null>(null);
  const [tariffs, setTariffs] = useState<TariffOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [amountRub, setAmountRub] = useState('');
  const [currency, setCurrency] = useState('RUB');
  const [description, setDescription] = useState('');
  const [expiresAtLocal, setExpiresAtLocal] = useState(defaultExpiresAtLocal);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const json = await apiJson<
          | { ok: true; organizations: OrganizationOption[]; tariffs: TariffOption[] }
          | { ok: false; error?: string }
        >('/api/admin/organizations', { credentials: 'include' });
        if (json.ok) {
          setOrganizations(json.organizations);
          setTariffs(json.tariffs);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'network');
      }
    })();
  }, []);

  const selectedTariff = useMemo(() => {
    const org = organizations?.find((o) => o.id === organizationId);
    return org?.tariffId ? (tariffs?.find((t) => t.id === org.tariffId) ?? null) : null;
  }, [organizationId, organizations, tariffs]);

  useEffect(() => {
    if (!selectedTariff) return;
    setAmountRub((prev) =>
      prev
        ? prev
        : selectedTariff.priceMinor != null
          ? (selectedTariff.priceMinor / 100).toFixed(2)
          : prev,
    );
    setCurrency((prev) => selectedTariff.currency ?? prev);
    setDescription((prev) =>
      prev ? prev : `${selectedTariff.name}, ${BILLING_PERIOD_LABELS[selectedTariff.billingPeriod]}`,
    );
  }, [selectedTariff]);

  const submit = useCallback(async () => {
    if (!organizationId) {
      setError('Выберите клинику.');
      return;
    }
    const amountMinor = Math.round(Number.parseFloat(amountRub.replace(',', '.')) * 100);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      setError('Введите сумму больше нуля.');
      return;
    }
    if (!description.trim()) {
      setError('Укажите, за что счёт.');
      return;
    }
    const expiresAtDate = new Date(expiresAtLocal);
    if (Number.isNaN(expiresAtDate.getTime()) || expiresAtDate.getTime() <= Date.now()) {
      setError('Срок действия должен быть в будущем.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const json = await apiJson<ManualInvoiceApiResponse>('/api/admin/saas-billing/payments/manual', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          amountMinor,
          currency,
          description: description.trim(),
          expiresAt: expiresAtDate.toISOString(),
        }),
      });
      if (json.ok) {
        setCheckoutUrl(json.invoice.providerCheckoutUrl ?? '');
        onCreated();
      }
    } catch (e) {
      setError(manualInvoiceErrorLabel(e instanceof Error ? e.message : 'network'));
    } finally {
      setSubmitting(false);
    }
  }, [amountRub, currency, description, expiresAtLocal, organizationId, onCreated]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Выставить счёт</DialogTitle>
          <DialogDescription>
            Счёт уходит провайдеру и получает ссылку на оплату — передайте её клинике.
          </DialogDescription>
        </DialogHeader>

        {checkoutUrl !== null ? (
          <div className="space-y-3">
            {checkoutUrl ? (
              <div className="space-y-1.5">
                <Label htmlFor="manual-invoice-link">Ссылка на оплату</Label>
                <Input id="manual-invoice-link" readOnly value={checkoutUrl} onFocus={(e) => e.currentTarget.select()} />
              </div>
            ) : (
              <p className="text-sm text-destructive" role="alert">
                Провайдер не вернул ссылку на оплату.
              </p>
            )}
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Готово
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {loadError && (
              <p className="text-sm text-destructive" role="alert">
                Список клиник не загрузился ({loadError}).
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="manual-invoice-org">Кому (клиника)</Label>
              <Select value={organizationId} onValueChange={(v) => setOrganizationId(v ?? '')}>
                <SelectTrigger id="manual-invoice-org" className="w-full">
                  <SelectValue placeholder="Выберите клинику" />
                </SelectTrigger>
                <SelectContent>
                  {(organizations ?? []).map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manual-invoice-amount">Сумма</Label>
                <Input
                  id="manual-invoice-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountRub}
                  onChange={(e) => setAmountRub(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-invoice-currency">Валюта</Label>
                <Input
                  id="manual-invoice-currency"
                  value={currency}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-invoice-description">За что</Label>
              <Input
                id="manual-invoice-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-invoice-expires">Срок действия (до)</Label>
              <Input
                id="manual-invoice-expires"
                type="datetime-local"
                value={expiresAtLocal}
                onChange={(e) => setExpiresAtLocal(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                Отмена
              </Button>
              <Button type="button" onClick={submit} disabled={submitting}>
                {submitting ? 'Выставляем…' : 'Выставить счёт'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type CancelApiResponse =
  | { ok: true; invoice: SaasBillingPlatformInvoiceRow }
  | { ok: false; error?: string };

/** К4 — cancel: only offered for `draft`/`pending` rows (see `CancelCell` below). */
function CancelInvoiceDialog({
  row,
  onClose,
  onSuccess,
}: {
  row: SaasBillingPlatformInvoiceRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const json = await apiJson<CancelApiResponse>(
        `/api/admin/saas-billing/payments/${row.id}/cancel`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      if (json.ok) onSuccess();
    } catch (e) {
      setError(cancelErrorLabel(e instanceof Error ? e.message : 'network'));
    } finally {
      setSubmitting(false);
    }
  }, [reason, row.id, onSuccess]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить счёт — {row.organizationTitle}</DialogTitle>
          <DialogDescription>
            {row.tariffName}, {formatAmount(row.amountMinor, row.currency)}. Отменённый счёт нельзя
            будет оплатить.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-invoice-reason">Причина (необязательно)</Label>
            <Input
              id="cancel-invoice-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Назад
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={submitting}>
            {submitting ? 'Отменяем…' : 'Отменить счёт'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformPaymentsSection() {
  const [applied, setApplied] = useState<FilterState>(emptyFilters);
  const [draft, setDraft] = useState<FilterState>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<SaasBillingPlatformInvoiceRow[] | null>(null);
  const [refundRow, setRefundRow] = useState<SaasBillingPlatformInvoiceRow | null>(null);
  const [cancelRow, setCancelRow] = useState<SaasBillingPlatformInvoiceRow | null>(null);
  const [manualInvoiceOpen, setManualInvoiceOpen] = useState(false);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.status) p.set('status', applied.status);
    if (applied.from) p.set('from', applied.from);
    if (applied.to) p.set('to', applied.to);
    if (applied.payer.trim()) p.set('payer', applied.payer.trim());
    return p.toString();
  }, [applied]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiJson<ApiResponse>(`/api/admin/saas-billing/payments?${queryString}`, {
        credentials: 'include',
      });
      setPayments(json.ok ? json.payments : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network');
      setPayments(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportQueryString = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.status) p.set('status', applied.status);
    if (applied.from) p.set('from', applied.from);
    if (applied.to) p.set('to', applied.to);
    if (applied.payer.trim()) p.set('payer', applied.payer.trim());
    return p.toString();
  }, [applied]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сводка за период</CardTitle>
          <CardDescription>
            Считается из нашего журнала за тот же период и по тому же плательщику, что выбраны
            фильтрами списка ниже — статус списка на сводку не влияет, она всегда показывает
            разбивку по всем статусам сразу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformPaymentsSummarySection
            periodFrom={applied.from}
            periodTo={applied.to}
            payer={applied.payer}
          />
        </CardContent>
      </Card>

      <Card id="platform-payments">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Платежи</CardTitle>
            <CardDescription>
              Счета клиник за тариф из нашего журнала (`saas_billing_invoices`).
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setManualInvoiceOpen(true)}>
            Выставить счёт
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="payments-status">Статус</Label>
              <Select
                value={draft.status}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, status: v as FilterState['status'] }))
                }
              >
                <SelectTrigger id="payments-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Все</SelectItem>
                  {(Object.keys(INVOICE_STATUS_LABELS) as SaasBillingInvoiceStatus[]).map(
                    (status) => (
                      <SelectItem key={status} value={status}>
                        {INVOICE_STATUS_LABELS[status]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payments-from">Дата с</Label>
              <Input
                id="payments-from"
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payments-to">Дата по</Label>
              <Input
                id="payments-to"
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payments-payer">Плательщик</Label>
              <Input
                id="payments-payer"
                value={draft.payer}
                onChange={(e) => setDraft((d) => ({ ...d, payer: e.target.value }))}
                placeholder="Название клиники"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setApplied({ ...draft })}
              >
                Применить фильтры
              </Button>
              <a
                href={`/api/admin/saas-billing/payments/export?${exportQueryString}`}
                download
                className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}
              >
                Выгрузить
              </a>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              Список платежей не загрузился ({error}).
            </p>
          )}

          {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

          {!loading && !error && (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Дата</th>
                    <th className="px-3 py-2 font-medium">Плательщик</th>
                    <th className="px-3 py-2 font-medium">За что</th>
                    <th className="px-3 py-2 font-medium">Сумма</th>
                    <th className="px-3 py-2 font-medium">Статус</th>
                    <th className="px-3 py-2 font-medium">Провайдер</th>
                    <th className="px-3 py-2 font-medium">Возврат</th>
                    <th className="px-3 py-2 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        Платежей пока нет.
                      </td>
                    </tr>
                  ) : (
                    (payments ?? []).map((row) => (
                      <tr key={row.id} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="px-3 py-2 align-top font-medium">{row.organizationTitle}</td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {row.description ?? row.tariffName}
                          <br />
                          {formatDate(row.servicePeriodStartsAt)} —{' '}
                          {formatDate(row.servicePeriodEndsAt)}
                          {row.expiresAt && (
                            <>
                              <br />
                              Срок действия: {formatDateTime(row.expiresAt)}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top font-medium">
                          {formatAmount(row.amountMinor, row.currency)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Badge variant={statusBadgeVariant(row.status)}>
                            {INVOICE_STATUS_LABELS[row.status]}
                          </Badge>
                          {isInvoiceOverdue(row) && (
                            <Badge variant="destructive" className="ml-1">
                              Просрочен
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {row.providerId}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <RefundCell row={row} onOpenRefund={() => setRefundRow(row)} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          {(row.status === 'draft' || row.status === 'pending') && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setCancelRow(row)}
                            >
                              Отменить
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {refundRow && (
          <RefundDialog
            row={refundRow}
            onClose={() => setRefundRow(null)}
            onSuccess={() => {
              setRefundRow(null);
              void load();
            }}
          />
        )}
        {cancelRow && (
          <CancelInvoiceDialog
            row={cancelRow}
            onClose={() => setCancelRow(null)}
            onSuccess={() => {
              setCancelRow(null);
              void load();
            }}
          />
        )}
        {manualInvoiceOpen && (
          <ManualInvoiceDialog
            onClose={() => {
              setManualInvoiceOpen(false);
              void load();
            }}
            onCreated={() => void load()}
          />
        )}
      </Card>

      <ReconciliationSection initialFrom={applied.from} initialTo={applied.to} />
    </div>
  );
}
