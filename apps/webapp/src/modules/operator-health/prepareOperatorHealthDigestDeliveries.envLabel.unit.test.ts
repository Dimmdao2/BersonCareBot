import { describe, expect, it, vi } from 'vitest';

/**
 * Дайджест здоровья системы шёл в очередь доставки МИМО чокпоинта `stampOperatorAlertSubject`
 * (docs/REPORTS/OPERATOR_ALERT_ENV_LABEL_2026-08-20.md, вердикт FAIL): третий отправитель в тот
 * же почтовый ящик оператора, который метку не нёс. Этот файл — тот самый тест в стиле
 * `dispatchOperatorAlert.envLabel.unit.test.ts` / `sendOperatorFallbackEmail.unit.test.ts`: убери
 * стемпинг из `prepareOperatorHealthDigestDeliveries` — он краснеет первым.
 */

vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://test.bersoncare.ru' } }));

import { defaultOperatorHealthAlertConfig } from '@/modules/operator-alerts/operatorHealthAlertConfig';
import { prepareOperatorHealthDigestDeliveries } from './prepareOperatorHealthDigestDeliveries';
import type { OperatorHealthDigestRecipients } from './prepareOperatorHealthDigestDeliveries';

function baseInput(title: string) {
  const config = defaultOperatorHealthAlertConfig();
  config.channels.digest.telegram = false;
  config.channels.digest.max = false;
  config.channels.digest.sms = false;
  config.channels.digest.email = true;
  config.channels.digest.web_push = true;
  const recipients: OperatorHealthDigestRecipients = {
    telegram: [],
    max: [],
    sms: [],
    email: ['operator@example.test'],
    web_push: ['user-id'],
  };
  return {
    localDate: '2026-08-20',
    occurredAt: '2026-08-20T08:00:00.000Z',
    lines: ['Сводка здоровья системы: всё в порядке'],
    title,
    url: '/app/admin/system-health',
    config,
    recipients,
  };
}

describe('prepareOperatorHealthDigestDeliveries — env label reaches the digest subject', () => {
  it('stamps [TEST] onto the email subject and the web-push title, text after it intact', () => {
    const deliveries = prepareOperatorHealthDigestDeliveries(baseInput('Сводка здоровья системы'));

    const email = deliveries.find(({ channel }) => channel === 'email');
    const webPush = deliveries.find(({ channel }) => channel === 'web_push');
    expect(email?.intent.payload).toMatchObject({ subject: '[TEST] Сводка здоровья системы' });
    expect(webPush?.intent.payload).toMatchObject({ title: '[TEST] Сводка здоровья системы' });
  });

  it('never double-stamps on a retried digest that already carries the label', () => {
    const deliveries = prepareOperatorHealthDigestDeliveries(
      baseInput('[TEST] Сводка здоровья системы'),
    );

    const email = deliveries.find(({ channel }) => channel === 'email');
    expect(email?.intent.payload).toMatchObject({ subject: '[TEST] Сводка здоровья системы' });
  });
});
