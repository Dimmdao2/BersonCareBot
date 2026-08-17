import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  gate: vi.fn(),
  createManualInvoice: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.gate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    saasBilling: { createManualSaasBillingInvoice: fakes.createManualInvoice },
  }),
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: fakes.loggerError },
}));

import { POST } from './route';

const requestBody = {
  organizationId: '00000000-0000-4000-8000-000000000118',
  amountMinor: 5_000,
  currency: 'RUB',
  description: 'Счёт за тариф',
  expiresAt: '2026-08-20T00:00:00.000+03:00',
};

function request(body: unknown = requestBody) {
  return new Request('https://app.example.test/api/admin/saas-billing/payments/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.gate.mockResolvedValue({ ok: true, session: { user: { role: 'admin' } } });
});

describe('manual SaaS invoice HTTP mapping', () => {
  it('rejects malformed input before resolving billing dependencies', async () => {
    const response = await POST(request({ ...requestBody, amountMinor: 0 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'invalid_manual_invoice_request',
    });
    expect(fakes.createManualInvoice).not.toHaveBeenCalled();
    expect(fakes.loggerError).not.toHaveBeenCalled();
  });

  it('returns the persisted provider checkout URL on success', async () => {
    const invoice = {
      id: '00000000-0000-4000-8000-000000000219',
      organizationId: requestBody.organizationId,
      providerCheckoutUrl: 'https://pay.example.test/invoice-219',
      status: 'pending',
    };
    fakes.createManualInvoice.mockResolvedValue(invoice);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, invoice });
    expect(fakes.createManualInvoice).toHaveBeenCalledWith(requestBody);
    expect(fakes.loggerError).not.toHaveBeenCalled();
  });

  it('refuses a success-shaped result that has no persisted checkout URL', async () => {
    fakes.createManualInvoice.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000219',
      organizationId: requestBody.organizationId,
      providerCheckoutUrl: null,
      status: 'draft',
    });

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'saas_billing_checkout_unavailable',
    });
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'saas_billing_manual_invoice_failed',
        root: 'provider_invalid_or_unavailable',
      }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it.each([
    ['organization_not_found', undefined, 404, 'organization_not_found'],
    ['saas_billing_no_tariff_assigned', undefined, 409, 'saas_billing_no_tariff_assigned'],
    [
      'saas_billing_receipt_customer_email_missing',
      undefined,
      422,
      'saas_billing_fiscal_data_invalid',
    ],
    [
      'saas_billing_provider_invoices_unsupported:yookassa',
      undefined,
      501,
      'saas_billing_provider_invoices_unsupported',
    ],
    [
      'yookassa_create_invoice_failed:403:provider refused',
      undefined,
      502,
      'saas_billing_provider_rejected_invoice',
    ],
    [
      'saas_billing_payment_provider_unavailable:yookassa',
      undefined,
      503,
      'saas_billing_payment_provider_unavailable',
    ],
    ['permission denied', '42501', 503, 'saas_billing_database_unavailable'],
    ['unexpected internal failure', undefined, 503, 'saas_billing_manual_invoice_unavailable'],
  ])('maps %s to a bounded refusal', async (message, code, status, publicError) => {
    fakes.createManualInvoice.mockRejectedValue(Object.assign(new Error(message), { code }));

    const response = await POST(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error: publicError });
    expect(fakes.loggerError).toHaveBeenCalledOnce();
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'saas_billing_manual_invoice_failed',
        errorName: 'Error',
        errorCode: code ?? null,
        root: expect.any(String),
      }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });

  it('never puts provider/fiscal response text into the structured root diagnostic', async () => {
    const secretEcho = 'fiscal-customer-secret@example.test';
    fakes.createManualInvoice.mockRejectedValue(
      new Error(`yookassa_create_invoice_failed:403:${secretEcho}`),
    );

    await POST(request());

    expect(JSON.stringify(fakes.loggerError.mock.calls)).not.toContain(secretEcho);
  });

  it('drops arbitrary error codes that could echo provider or customer data', async () => {
    const secretCode = 'customer-secret-code';
    fakes.createManualInvoice.mockRejectedValue(
      Object.assign(new Error('unexpected internal failure'), { code: secretCode }),
    );

    await POST(request());

    expect(JSON.stringify(fakes.loggerError.mock.calls)).not.toContain(secretCode);
    expect(fakes.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: null }),
      '[saas-billing/manual-invoice] creation failed',
    );
  });
});
