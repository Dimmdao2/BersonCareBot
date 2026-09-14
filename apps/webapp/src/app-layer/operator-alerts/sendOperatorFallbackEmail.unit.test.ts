import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fallback-письмо (design D-b) идёт мимо `dispatchOperatorAlert` своим отдельным путём. Проверяем
 * два свойства, которые ломаются молча и дорого: письмо уходит СЛУЖЕБНОЙ аудитории (иначе на шве
 * webapp → integrator оно уедет отправителем TherapyGo к пациентам) и тема помечена средой (иначе
 * дежурный не отличит боевую тревогу от тестовой). Дословный текст метки и порядок аргументов
 * адаптера НЕ фиксируем — это оформление, а не поведение.
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

describe('sendOperatorFallbackEmail', () => {
  beforeEach(() => {
    sendTransactionalEmail.mockClear();
  });

  it('уходит служебной аудитории и несёт пометку среды в теме', async () => {
    const subject = 'Therapysto: некому доставить служебное уведомление';
    const text = 'Служебное уведомление не имело ни одного адресата.';

    await sendOperatorFallbackEmail({ to: 'fallback@example.com', subject, text });

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const args = sendTransactionalEmail.mock.calls[0] as unknown as string[];

    expect(args).toContain('fallback@example.com');
    expect(args).toContain('staff');

    const sentSubject = args.find((arg) => arg.includes(subject));
    expect(sentSubject).toBeDefined();
    /* Тема осталась читаемой и при этом помечена средой — какой именно строкой, неважно. */
    expect(sentSubject).not.toBe(subject);
  });
});
