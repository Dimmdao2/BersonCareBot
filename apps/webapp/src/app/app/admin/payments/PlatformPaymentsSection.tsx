'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SaasBillingInvoiceStatus,
  SaasBillingPlatformInvoiceRow,
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

export function PlatformPaymentsSection() {
  const [applied, setApplied] = useState<FilterState>(emptyFilters);
  const [draft, setDraft] = useState<FilterState>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<SaasBillingPlatformInvoiceRow[] | null>(null);

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
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium">Плательщик</th>
                  <th className="px-3 py-2 font-medium">За что</th>
                  <th className="px-3 py-2 font-medium">Сумма</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                  <th className="px-3 py-2 font-medium">Провайдер</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
