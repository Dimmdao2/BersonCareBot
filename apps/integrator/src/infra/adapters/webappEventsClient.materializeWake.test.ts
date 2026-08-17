import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const WEBHOOK_SECRET = 'scheduler-wake-audit-secret';

vi.mock('../../config/env.js', () => ({
  integratorWebhookSecret: () => WEBHOOK_SECRET,
}));

import { createWebappEventsPort } from './webappEventsClient.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('webapp events client patient reminder materialization wake', () => {
  it('signs the exact organization-bound body and idempotency key', async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const organizationId = 'd0000000-0000-4000-8000-00000000000d';
    const wakeId = 'sch:ffffffff-ffff-4fff-8fff-ffffffffffff';
    const port = createWebappEventsPort({
      getAppBaseUrl: async () => 'https://app.example/',
    });

    const result = await port.wakePatientReminderMaterialization?.({ organizationId, wakeId });

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.stringify({ organizationId, wakeId });
    expect(url).toBe('https://app.example/api/integrator/patient-reminders/materialize-wake');
    expect(init).toMatchObject({ method: 'POST', body });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['X-Bersoncare-Idempotency-Key']).toBe(
      `patient-reminder-materialize:${organizationId}:${wakeId}`,
    );
    expect(headers['X-Bersoncare-Signature']).toBe(
      createHmac('sha256', WEBHOOK_SECRET)
        .update(`${headers['X-Bersoncare-Timestamp']}.${body}`)
        .digest('base64url'),
    );
  });
});
