/**
 * GET /api/admin/saas-billing/payments/export — К3 item 5: the same rows the payments screen shows
 * (К1 journal, same filters), downloadable as a file for bookkeeping. CSV — the common tabular
 * interchange format every spreadsheet/accounting tool imports — not a bespoke format (plan: "своего
 * формата не изобретать"). Semicolon-delimited with a UTF-8 BOM so it opens directly (Cyrillic intact)
 * in Excel under the ru-RU locale, where `,` is the decimal separator rather than a field delimiter.
 *
 * Platform-only, same gate and same query contract as the list route (К1).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import {
  adminAuditDayEndUtcIso,
  adminAuditDayStartUtcIso,
} from '@/modules/admin/adminAuditListQuery';
import type { SaasBillingInvoiceStatus } from '@/modules/saas-billing/ports';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  status: z.enum(['draft', 'pending', 'paid', 'failed', 'void']).optional(),
  payer: z.string().trim().min(1).optional(),
});

const INVOICE_STATUS_LABELS: Record<SaasBillingInvoiceStatus, string> = {
  draft: 'Черновик',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
  void: 'Аннулирован',
};

function csvField(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function minorToAmountString(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace('.', ',');
}

const CSV_COLUMNS = [
  'Дата',
  'Плательщик',
  'Тариф',
  'Период с',
  'Период по',
  'Сумма',
  'Валюта',
  'Статус',
  'Провайдер',
  'Возвращено',
  'В обработке (возврат)',
];

export async function GET(req: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }
  const { from, to, status, payer } = parsed.data;

  let payments;
  try {
    payments = await buildAppDeps().saasBilling.listPlatformPayments({
      periodFrom: from ? adminAuditDayStartUtcIso(from) : undefined,
      periodTo: to ? adminAuditDayEndUtcIso(to) : undefined,
      status,
      payerSearch: payer,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'saas_billing_payments_unavailable' },
      { status: 500 },
    );
  }

  const rows = payments.map((row) =>
    [
      row.createdAt,
      row.organizationTitle,
      row.tariffName,
      row.servicePeriodStartsAt,
      row.servicePeriodEndsAt,
      minorToAmountString(row.amountMinor),
      row.currency,
      INVOICE_STATUS_LABELS[row.status],
      row.providerId,
      minorToAmountString(row.refundedMinor),
      minorToAmountString(row.pendingRefundMinor),
    ]
      .map((value) => csvField(String(value)))
      .join(';'),
  );

  const csv = `${CSV_COLUMNS.join(';')}\n${rows.join('\n')}\n`;
  const body = `﻿${csv}`;
  const filename = `saas-billing-payments_${from ?? 'all'}_${to ?? 'all'}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
