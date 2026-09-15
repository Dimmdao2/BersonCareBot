import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientPayment } from '@/modules/patient-payments/ports';
import type { PaymentHistoryEventRecord } from '@/modules/payments/types';

const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  requireEntitlementForRead: vi.fn(),
  buildAppDeps: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  listOrganizationPayments: vi.fn(),
  listPaymentHistoryForOrganization: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: fakes.requireEntitlementForRead,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { GET } from './route';

const ORGANIZATION_A = '11111111-1111-4111-8111-111111111111';

const cashPayment: PatientPayment = {
  id: 'cash-a',
  organizationId: ORGANIZATION_A,
  patientUserId: '33333333-3333-4333-8333-333333333333',
  amountMinor: 12_500,
  currency: 'RUB',
  kind: 'cash',
  status: 'paid',
  comment: null,
  service: 'Консультация',
  visitId: null,
  appointmentId: null,
  patientPackageId: null,
  idempotencyKey: null,
  provider: null,
  providerPaymentId: null,
  createdBy: 'doctor-a',
  createdAt: '2026-09-15T10:00:00.000Z',
};

const prepaymentEvent: PaymentHistoryEventRecord = {
  id: 'prepayment-a',
  organizationId: ORGANIZATION_A,
  appointmentId: null,
  platformUserId: cashPayment.patientUserId,
  paymentId: null,
  refundId: null,
  eventType: 'payment.captured',
  amountMinor: 2_500,
  currency: 'RUB',
  providerId: 'provider-a',
  status: 'captured',
  purpose: 'Предоплата',
  comment: null,
  occurredAt: '2026-09-15T11:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
    ok: true,
    ctx: { organizationId: ORGANIZATION_A, session: { user: { userId: 'doctor-a' } } },
  });
  fakes.requireEntitlementForRead.mockResolvedValue({ ok: true });
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, _source: string, work: () => Promise<unknown>) => work(),
  );
  fakes.listOrganizationPayments.mockResolvedValue([]);
  fakes.listPaymentHistoryForOrganization.mockResolvedValue([]);
  fakes.buildAppDeps.mockReturnValue({
    patientPayments: { listOrganizationPayments: fakes.listOrganizationPayments },
    payments: { listPaymentHistoryForOrganization: fakes.listPaymentHistoryForOrganization },
  });
});

describe('doctor organization payment history route', () => {
  it('binds both ledgers to the selected workspace and exposes no caller-selected organization', async () => {
    fakes.listOrganizationPayments.mockResolvedValue([cashPayment]);
    fakes.listPaymentHistoryForOrganization.mockImplementation(async (organizationId: string) =>
      organizationId === ORGANIZATION_A ? [prepaymentEvent] : [],
    );

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      timeline: [
        { id: prepaymentEvent.id, amountMinor: prepaymentEvent.amountMinor },
        { id: cashPayment.id, amountMinor: cashPayment.amountMinor },
      ],
    });
    expect(fakes.requireEntitlementForRead).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_A },
      'payments',
    );
    expect(fakes.withDoctorWorkspacePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_A }),
      'api/doctor/payments/history:GET',
      expect.any(Function),
    );
    expect(fakes.listPaymentHistoryForOrganization).toHaveBeenCalledWith(ORGANIZATION_A);
  });

  it('refuses the read before either payment ledger is queried when the tariff omits payments', async () => {
    const denied = Response.json({ ok: false, error: 'entitlement_required' }, { status: 403 });
    fakes.requireEntitlementForRead.mockResolvedValue({ ok: false, response: denied });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.listOrganizationPayments).not.toHaveBeenCalled();
    expect(fakes.listPaymentHistoryForOrganization).not.toHaveBeenCalled();
  });

  it('returns an empty timeline instead of an error for an organization without payments', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, timeline: [] });
  });
});
