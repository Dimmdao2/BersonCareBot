import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fallback-письмо (design D-b) идёт мимо `dispatchOperatorAlert` своим отдельным путём —
 * поэтому у него отдельный тест на ту же метку в теме, а не переиспользование чужого.
 */

vi.mock('@/config/env', () => ({
  env: { APP_BASE_URL: 'https://bersoncare.ru', INTEGRATOR_API_URL: 'http://integrator.local' },
  integratorWebhookSecret: () => 'shared-secret',
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const sendTransactionalEmail = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/infra/integrations/email/integratorEmailAdapter', () => ({
  createIntegratorEmailAdapter: () => ({ sendTransactionalEmail }),
}));

import { sendOperatorFallbackEmail } from './sendOperatorFallbackEmail';

describe('sendOperatorFallbackEmail — env label on the fallback subject', () => {
  beforeEach(() => {
    sendTransactionalEmail.mockClear();
  });

  it('prefixes [PROD] and keeps the rest of the subject intact', async () => {
    await sendOperatorFallbackEmail({
      to: 'fallback@example.com',
      subject: 'BersonCare: некому доставить служебное уведомление',
      text: 'Служебное уведомление не имело ни одного адресата.',
    });

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      'fallback@example.com',
      '[PROD] BersonCare: некому доставить служебное уведомление',
      'Служебное уведомление не имело ни одного адресата.',
    );
  });
});
