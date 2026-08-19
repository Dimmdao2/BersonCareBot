/**
 * Поломка, которую ловит этот файл: «маршрут отмены получил отказ „это счёт за место“ и ответил
 * `200 ok:true`». Кабинет показал бы успешную отмену, которой не было, — оператор считает вопрос
 * закрытым, а счёт живой. Дорого (решение принимается по ложному ответу) и молча (на экране всё
 * зелёное).
 *
 * И симметрично для перевыставления: отказ обязан приезжать кодом, а успех — идентификатором
 * преемника, иначе кабинет не сможет показать, куда переехала сумма.
 */
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));

import { POST as cancel } from './cancel/route';
import { POST as reissue } from './reissue/route';

const INVOICE_ID = '11111111-1111-4111-8111-111111111111';
const SUCCESSOR_ID = '22222222-2222-4222-8222-222222222222';

function request(): Request {
  return new Request('http://localhost/api/admin/saas-billing/payments/x/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'проверка' }),
  });
}

const params = Promise.resolve({ invoiceId: INVOICE_ID });

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'platform-admin' } },
  });
});

describe('отмена счёта за место отвергается маршрутом', () => {
  it('отвечает 409 и называет причину видом счёта, а не статусом', async () => {
    const cancelSaasBillingInvoice = vi
      .fn()
      .mockResolvedValue({ outcome: 'seat_invoice_not_cancellable' });
    fakes.buildAppDeps.mockReturnValue({ saasBilling: { cancelSaasBillingInvoice } });

    const response = await cancel(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ ok: false, error: 'seat_invoice_not_cancellable' });
  });

  it('не пускает к сервису запрос без платформенной сессии', async () => {
    const denied = NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({ ok: false, response: denied });

    const response = await cancel(request(), { params });

    expect(response).toBe(denied);
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
  });
});

describe('перевыставление счёта за место', () => {
  it('возвращает преемника и погашенный счёт', async () => {
    const reissueSeatOverageInvoice = vi.fn().mockResolvedValue({
      outcome: 'reissued',
      invoice: { id: SUCCESSOR_ID },
      superseded: { id: INVOICE_ID },
    });
    fakes.buildAppDeps.mockReturnValue({ saasBilling: { reissueSeatOverageInvoice } });

    const response = await reissue(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      invoice: { id: SUCCESSOR_ID },
      supersededInvoiceId: INVOICE_ID,
    });
    expect(reissueSeatOverageInvoice).toHaveBeenCalledWith({
      saasBillingInvoiceId: INVOICE_ID,
      actorId: 'platform-admin',
      reason: 'проверка',
    });
  });

  it('отвечает 409, когда перевыставлять нечего', async () => {
    const reissueSeatOverageInvoice = vi
      .fn()
      .mockResolvedValue({ outcome: 'invoice_not_reissuable', status: 'paid' });
    fakes.buildAppDeps.mockReturnValue({ saasBilling: { reissueSeatOverageInvoice } });

    const response = await reissue(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ ok: false, error: 'invoice_not_reissuable', status: 'paid' });
  });

  it('отвечает 409 на счёт другого вида', async () => {
    const reissueSeatOverageInvoice = vi
      .fn()
      .mockResolvedValue({ outcome: 'invoice_kind_not_reissuable', invoiceKind: 'tariff_period' });
    fakes.buildAppDeps.mockReturnValue({ saasBilling: { reissueSeatOverageInvoice } });

    const response = await reissue(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: 'invoice_kind_not_reissuable',
      invoiceKind: 'tariff_period',
    });
  });

  it('не пускает к сервису запрос без платформенной сессии', async () => {
    const denied = NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({ ok: false, response: denied });

    const response = await reissue(request(), { params });

    expect(response).toBe(denied);
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
  });
});
