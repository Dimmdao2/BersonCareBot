import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireClinic: vi.fn(),
  requireEntitlement: vi.fn(),
  getSetting: vi.fn(),
  updateSettingIfUnchanged: vi.fn(),
  relayOutbound: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinic,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlement,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    systemSettings: {
      getSetting: fakes.getSetting,
      updateSettingIfUnchanged: fakes.updateSettingIfUnchanged,
    },
  }),
}));
vi.mock('@/modules/messaging/relayOutbound', () => ({ relayOutbound: fakes.relayOutbound }));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const setting = {
  key: 'clinic_smtp_outbound',
  scope: 'admin',
  organizationId,
  valueJson: {
    value: {
      host: 'smtp.clinic.test',
      user: 'clinic',
      password: 'secret',
      from: 'clinic@example.test',
    },
    deliveryReadiness: { status: 'pending' },
  },
  updatedAt: '2026-08-24T00:00:00.000Z',
  updatedBy: 'owner-1',
};

function request(channel: 'email' | 'telegram' | 'max') {
  return new Request('https://app.example.test/api/admin/clinic-delivery-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireClinic.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId,
      session: {
        user: {
          userId: 'owner-1',
          email: 'employee@example.test',
          contacts: [
            {
              kind: 'email',
              value: 'confirmed-employee@example.test',
              confirmedAt: '2026-08-20T00:00:00.000Z',
            },
          ],
          bindings: { telegramId: '777', maxId: '888' },
        },
      },
    },
  });
  fakes.getSetting.mockResolvedValue(setting);
  fakes.requireEntitlement.mockResolvedValue({ ok: true });
  fakes.updateSettingIfUnchanged.mockImplementation(
    async (_key: string, _scope: string, valueJson: unknown) => ({ ...setting, valueJson }),
  );
});

describe('POST /api/admin/clinic-delivery-test', () => {
  it('enables email only after accepted live delivery to the authenticated employee', async () => {
    fakes.relayOutbound.mockResolvedValue({ ok: true, status: 'accepted' });

    const response = await POST(request('email'));

    expect(response.status).toBe(200);
    expect(fakes.requireEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      'clinic_smtp',
    );
    expect(fakes.relayOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        channel: 'email',
        recipient: 'confirmed-employee@example.test',
        clinicCredentialProbe: true,
      }),
      { retryDelaysMs: [0] },
    );
    expect(fakes.updateSettingIfUnchanged).toHaveBeenCalledWith(
      'clinic_smtp_outbound',
      'admin',
      expect.objectContaining({
        deliveryReadiness: expect.objectContaining({ status: 'enabled' }),
      }),
      'owner-1',
      setting.updatedAt,
      { organizationId },
    );
  });

  it('does not probe or change a channel that is unavailable to the clinic', async () => {
    fakes.requireEntitlement.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'entitlement_required' }), {
        status: 403,
      }),
    });

    const response = await POST(request('email'));

    expect(response.status).toBe(403);
    expect(fakes.relayOutbound).not.toHaveBeenCalled();
    expect(fakes.updateSettingIfUnchanged).not.toHaveBeenCalled();
  });

  it('records a visible failure and does not enable the channel', async () => {
    fakes.relayOutbound.mockResolvedValue({ ok: false, reason: 'provider_rejected' });

    const response = await POST(request('email'));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      readiness: { status: 'failed' },
    });
    expect(fakes.updateSettingIfUnchanged).toHaveBeenCalledWith(
      'clinic_smtp_outbound',
      'admin',
      expect.objectContaining({ deliveryReadiness: expect.objectContaining({ status: 'failed' }) }),
      'owner-1',
      setting.updatedAt,
      { organizationId },
    );
  });

  it('does not enable a provider-skipped probe', async () => {
    fakes.relayOutbound.mockResolvedValue({ ok: true, status: 'skipped' });

    const response = await POST(request('email'));

    expect(response.status).toBe(502);
    expect(fakes.updateSettingIfUnchanged).toHaveBeenCalledWith(
      'clinic_smtp_outbound',
      'admin',
      expect.objectContaining({ deliveryReadiness: expect.objectContaining({ status: 'failed' }) }),
      'owner-1',
      setting.updatedAt,
      { organizationId },
    );
  });

  it('uses the employee binding for a bot probe', async () => {
    fakes.getSetting.mockResolvedValue({ ...setting, key: 'clinic_telegram_bot_token' });
    fakes.relayOutbound.mockResolvedValue({ ok: true, status: 'accepted' });

    const response = await POST(request('telegram'));

    expect(response.status).toBe(200);
    expect(fakes.relayOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram', recipient: '777' }),
      { retryDelaysMs: [0] },
    );
  });
});
