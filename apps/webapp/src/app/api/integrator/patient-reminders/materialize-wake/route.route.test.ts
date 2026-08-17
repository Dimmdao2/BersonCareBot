import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  signatureValid: true,
  principalAccepted: true,
  runWake: vi.fn(),
}));

vi.mock('@/app-layer/idempotency/idempotencyStore', () => ({
  isKeyValid: (key: string) => key.length > 0 && key.length <= 256,
}));
vi.mock('@/app-layer/integrator/verifyIntegratorSignature', () => ({
  verifyIntegratorSignature: () => fakes.signatureValid,
}));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: () => fakes.principalAccepted,
}));
vi.mock('@/app-layer/reminders/runPatientReminderMaterializationWake', () => ({
  runPatientReminderMaterializationWake: fakes.runWake,
}));

import { POST } from './route';

const organizationId = 'd0000000-0000-4000-8000-00000000000d';
const schedulerWakeId = 'sch:ffffffff-ffff-4fff-8fff-ffffffffffff';

function request(overrides: { key?: string; body?: unknown } = {}) {
  const body = overrides.body ?? { wakeId: schedulerWakeId, organizationId };
  return new Request('https://test.example/api/integrator/patient-reminders/materialize-wake', {
    method: 'POST',
    headers: {
      'x-bersoncare-timestamp': '1785369600',
      'x-bersoncare-signature': 'sig',
      'x-bersoncare-idempotency-key':
        overrides.key ?? `patient-reminder-materialize:${organizationId}:${schedulerWakeId}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fakes.signatureValid = true;
  fakes.principalAccepted = true;
  fakes.runWake.mockReset();
  fakes.runWake.mockResolvedValue({
    rules: 1,
    occurrences: 1,
    materialized: 1,
    deduplicated: 0,
    skipped: 0,
  });
});

describe('patient reminder materialization signed wake route', () => {
  it('accepts the exact signed organization-bound idempotency contract', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(fakes.runWake).toHaveBeenCalledWith(organizationId);
  });

  it('rejects invalid signatures before materialization', async () => {
    fakes.signatureValid = false;
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(fakes.runWake).not.toHaveBeenCalled();
  });

  it('rejects a key copied across organizations or wake ids', async () => {
    const response = await POST(
      request({ key: `patient-reminder-materialize:other:${schedulerWakeId}` }),
    );
    expect(response.status).toBe(400);
    expect(fakes.runWake).not.toHaveBeenCalled();
  });

  it('rejects an oversized wake id even when the organization-bound key matches it', async () => {
    const oversizedWakeId = `sch:${'a'.repeat(61)}`;
    const response = await POST(
      request({
        key: `patient-reminder-materialize:${organizationId}:${oversizedWakeId}`,
        body: { wakeId: oversizedWakeId, organizationId },
      }),
    );
    expect(response.status).toBe(400);
    expect(fakes.runWake).not.toHaveBeenCalled();
  });

  it('rejects a blank wake id even when the organization-bound key matches it', async () => {
    const response = await POST(
      request({
        key: `patient-reminder-materialize:${organizationId}:`,
        body: { wakeId: '', organizationId },
      }),
    );
    expect(response.status).toBe(400);
    expect(fakes.runWake).not.toHaveBeenCalled();
  });

  it('fails closed when the verified organization principal cannot be installed', async () => {
    fakes.principalAccepted = false;
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(fakes.runWake).not.toHaveBeenCalled();
  });
});
