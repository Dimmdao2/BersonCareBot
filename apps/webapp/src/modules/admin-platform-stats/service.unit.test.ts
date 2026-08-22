import { describe, expect, it, vi } from 'vitest';

import { createAdminPlatformUserStatsService } from '@/modules/admin-platform-stats/service';

const AUDIENCE = {
  includeTestAccounts: false,
  testPhones: [],
  testTelegramIds: [],
  testMaxIds: [],
};

/** Одна дверь на оба экрана — значит один снимок, из которого каждый экран берёт свою секцию. */
function portReturning(snapshot: {
  registrationsTotal?: number;
  mergesTotal?: number;
  registrationsByDay?: [string, number][];
  mergesByDay?: [string, number][];
  subscribersBeforeStart?: number;
  subscribersNewByDay?: [string, number][];
}) {
  return {
    readStats: vi.fn(async () => ({
      registrationsTotal: snapshot.registrationsTotal ?? 0,
      mergesTotal: snapshot.mergesTotal ?? 0,
      registrationsByDay: new Map(snapshot.registrationsByDay ?? []),
      mergesByDay: new Map(snapshot.mergesByDay ?? []),
      subscribersBeforeStart: snapshot.subscribersBeforeStart ?? 0,
      subscribersNewByDay: new Map(snapshot.subscribersNewByDay ?? []),
    })),
  };
}

describe('admin platform user stats', () => {
  it('каждый экран читает СВОЮ секцию общего снимка', async () => {
    // Числа регистраций и подписчиков заведомо разные: экран, взявший чужую секцию, здесь падает,
    // а на живой странице выглядел бы просто правдоподобным неверным графиком.
    const port = portReturning({
      registrationsTotal: 9,
      mergesTotal: 3,
      registrationsByDay: [['2026-08-19', 9]],
      mergesByDay: [['2026-08-19', 3]],
      subscribersBeforeStart: 100,
      subscribersNewByDay: [['2026-08-19', 7]],
    });
    const service = createAdminPlatformUserStatsService(port);

    const registrations = await service.getRegistrationStats({
      iana: 'Europe/Moscow',
      preset: 'custom',
      customFrom: '2026-08-13',
      customTo: '2026-08-19',
      audience: AUDIENCE,
    });
    const subscribers = await service.getSubscriberStats({
      iana: 'Europe/Moscow',
      preset: 'custom',
      customFrom: '2026-08-13',
      customTo: '2026-08-19',
      audience: AUDIENCE,
    });

    expect(registrations.summary).toEqual({ registrations: 9, merges: 3, combined: 12 });
    expect(registrations.series.at(-1)).toEqual({
      day: '2026-08-19',
      registrations: 9,
      merges: 3,
    });
    // Кумулятив подписчиков стартует с числа «до окна» и растёт приростом первых привязок.
    expect(subscribers.summary).toEqual({ cumulativeEnd: 107, deltaInRange: 7 });
    expect(subscribers.series.at(0)?.cumulativeSubscribers).toBe(100);
    expect(subscribers.series.at(-1)?.cumulativeSubscribers).toBe(107);
  });

  it('экран обращается к порту один раз, а не по разу на счётчик', async () => {
    const port = portReturning({ registrationsTotal: 1 });
    const service = createAdminPlatformUserStatsService(port);

    await service.getRegistrationStats({ iana: 'Europe/Moscow', preset: 'week', audience: AUDIENCE });

    expect(port.readStats).toHaveBeenCalledTimes(1);
  });
});
