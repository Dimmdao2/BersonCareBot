'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SaasBillingInvoiceStatus,
  SaasBillingPlatformInvoiceRow,
  SaasBillingRefund,
} from '@/modules/saas-billing/ports';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
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

export function PlatformPaymentsSection() {
  const [applied, setApplied] = useState<FilterState>(emptyFilters);
  const [draft, setDraft] = useState<FilterState>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<SaasBillingPlatformInvoiceRow[] | null>(null);
  const [refundRow, setRefundRow] = useState<SaasBillingPlatformInvoiceRow | null>(null);

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
      const json = await apiJson<ApiResponse>(
        `/api/admin/saas-billing/payments?${queryString}`,
        { credentials: 'include' },
      );
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

  return (
    <Card id="platform-payments">
      <CardHeader>
        <CardTitle className="text-base">Платежи</CardTitle>
        <CardDescription>
          Счета клиник за тариф из нашего журнала (`saas_billing_invoices`). Сверка с провайдером — на
          отдельном этапе.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="payments-status">Статус</Label>
            <Select
              value={draft.status}
              onValueChange={(v) => setDraft((d) => ({ ...d, status: v as FilterState['status'] }))}
            >
              <SelectTrigger id="payments-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все</SelectItem>
                {(Object.keys(INVOICE_STATUS_LABELS) as SaasBillingInvoiceStatus[]).map((status) => (
                  <SelectItem key={status} value={status}>
                    {INVOICE_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
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
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setApplied({ ...draft })}
            >
              Применить фильтры
            </Button>
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
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
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
                        {row.tariffName}
                        <br />
                        {formatDate(row.servicePeriodStartsAt)} — {formatDate(row.servicePeriodEndsAt)}
                      </td>
                      <td className="px-3 py-2 align-top font-medium">
                        {formatAmount(row.amountMinor, row.currency)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge variant={statusBadgeVariant(row.status)}>
                          {INVOICE_STATUS_LABELS[row.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                        {row.providerId}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <RefundCell row={row} onOpenRefund={() => setRefundRow(row)} />
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
    </Card>
  );
}
