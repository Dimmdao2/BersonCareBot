import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Режим ТЕСТ молчит (владелец 15.09.2026: «надо дописать чтобы не орал»).
 *
 * Проверяется поведение, а не написание: ни одна отправка не ушла, и наружу названа причина
 * `test_mode` — по ней видно, что алерт подавлен режимом, а не потерян.
 */

vi.mock('@/config/env', () => ({
  env: { APP_BASE_URL: 'https://test.bersoncare.ru', TEST: true },
}));
const warn = vi.hoisted(() => vi.fn());
vi.mock('@/infra/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn },
}));
const getConfigValue = vi.hoisted(() => vi.fn(async () => ''));
vi.mock('@/modules/system-settings/configAdapter', () => ({ getConfigValue }));
vi.mock('./emptyAudienceRuntime', () => ({
  reportEmptyAudience: vi.fn(async () => undefined),
}));

const relayCalls: string[] = [];
vi.mock('./relayOperatorAlert', () => ({
  relayOperatorAlert: vi.fn(async (input: Record<string, unknown>) => {
    relayCalls.push(input.channel as string);
    return { ok: true, status: 'accepted' as const };
  }),
}));

import { dispatchOperatorAlert } from './dispatchOperatorAlert';
import { registerAdminIncidentStaffPushDeps } from '@/modules/admin-incidents/adminIncidentStaffPushRuntime';
import { registerAdminNotificationTargetsPort } from './adminNotificationTargetsRuntime';

describe('dispatchOperatorAlert в режиме ТЕСТ', () => {
  beforeEach(() => {
    relayCalls.length = 0;
    warn.mockClear();
    getConfigValue.mockClear();
    registerAdminNotificationTargetsPort({
      loadTargets: async () => ({
        telegram: ['1'],
        max: ['2'],
        sms: ['+70000000000'],
        email: ['operator@example.com'],
      }),
    });
    registerAdminIncidentStaffPushDeps({
      staffUsers: {
        listActiveStaffUserIds: async () => ['staff-1'],
        listActiveStaffOrganizationRecipients: async () => [],
      },
    });
  });

  it('не отправляет ничего и называет причину', async () => {
    const result = await dispatchOperatorAlert({
      block: 'critical',
      topic: 'outbound_delivery_provider',
      dedupKey: 'critical:outbound_delivery_provider:active',
      lines: ['Провайдер доставки отказывает'],
    });

    expect(result).toEqual({ dispatched: false, reason: 'test_mode' });
    expect(relayCalls).toEqual([]);
    // Владелец 15.09: «прод пусть молчит, но логи пишет» — подавленный алерт остаётся в журнале
    // вместе с темой, иначе разбирать инцидент будет не по чему.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'operator_alert_suppressed_test_mode',
        topic: 'outbound_delivery_provider',
      }),
      expect.any(String),
    );
  });

  it('молчит до чтения настроек и аудитории — лишних поездок в базу нет', async () => {
    await dispatchOperatorAlert({
      block: 'critical',
      topic: 'webapp_db',
      dedupKey: 'critical:webapp_db:down',
      lines: ['База недоступна'],
    });

    expect(getConfigValue).not.toHaveBeenCalled();
  });
});
