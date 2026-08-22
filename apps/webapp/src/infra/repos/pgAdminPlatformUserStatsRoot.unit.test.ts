import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  drizzle: { select: vi.fn(), transaction: vi.fn(), execute: vi.fn() },
  runWebappPgText: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: fakes.runWebappPgText,
  runWebappSql: vi.fn(),
  webappSqlFromPgText: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import { createPgAdminPlatformUserStatsPort } from '@/infra/repos/pgAdminPlatformUserStats';

const STATS = {
  registrations: { total: 12, byDay: { '2026-08-18': 5, '2026-08-19': 7 } },
  merges: { total: 2, byDay: { '2026-08-19': 2 } },
  subscribers: { countBeforeStart: 231, newByDay: { '2026-08-19': 4 } },
};

const WINDOW = {
  iana: 'Europe/Moscow',
  startUtcIso: '2026-08-12T21:00:00.000Z',
  endExclusiveUtcIso: '2026-08-19T21:00:00.000Z',
  audience: {
    includeTestAccounts: false,
    testPhones: ['+79990000009'],
    testTelegramIds: ['555'],
    testMaxIds: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('глобальный админ получает настоящие числа обоих экранов из одного ответа', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ stats: STATS }] });

  const snapshot = await createPgAdminPlatformUserStatsPort().readStats(WINDOW);

  expect(snapshot.registrationsTotal).toBe(12);
  expect(snapshot.registrationsByDay.get('2026-08-18')).toBe(5);
  expect(snapshot.mergesTotal).toBe(2);
  expect(snapshot.mergesByDay.get('2026-08-19')).toBe(2);
  expect(snapshot.subscribersBeforeStart).toBe(231);
  expect(snapshot.subscribersNewByDay.get('2026-08-19')).toBe(4);
  // Один вызов на оба экрана: счётчики одного набора данных — колонки одного ответа (AGENTS §5).
  expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
});

it('счётчики идут через объявленную дверь, а не читают отношения напрямую', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ stats: STATS }] });

  await createPgAdminPlatformUserStatsPort().readStats(WINDOW);

  const [, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] ?? [];
  expect(identity).toBe(
    'app.read_platform_user_stats(timestamp with time zone,timestamp with time zone,text,text)',
  );
  expect(args?.slice(0, 3)).toEqual([
    '2026-08-12T21:00:00.000Z',
    '2026-08-19T21:00:00.000Z',
    'Europe/Moscow',
  ]);
  // Прямое чтение `platform_users`/`user_channel_bindings` здесь — это 42501 под
  // `app_platform_settings` и HTTP 500 на обоих экранах (живой обход TEST 22.08.2026).
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
  expect(fakes.runWebappPgText).not.toHaveBeenCalled();
});

it('служебные учётки уходят за дверь идентификаторами, а не резолвятся в id', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ stats: STATS }] });

  await createPgAdminPlatformUserStatsPort().readStats(WINDOW);

  const audience = JSON.parse(String(fakes.runWebappNamedRoot.mock.calls[0]?.[2]?.[3]));
  expect(audience.excludedPhones).toContain('+70000000000');
  expect(audience.excludedPhones).toContain('+79990000009');
  expect(audience.telegramIds).toEqual(['555']);
  // Оба экрана считают строки `role = 'client'`: сотрудников там нет, и вычитать их — исказить счёт.
  expect(audience.excludeStaffRoles).toBe(false);
});

it('пустой ответ двери не превращается в NaN на экране', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [] });

  const snapshot = await createPgAdminPlatformUserStatsPort().readStats(WINDOW);

  expect(snapshot.registrationsTotal).toBe(0);
  expect(snapshot.subscribersBeforeStart).toBe(0);
  expect(snapshot.registrationsByDay.size).toBe(0);
});

it('отказ двери всплывает наверх, а не подменяется нулями', async () => {
  fakes.runWebappNamedRoot.mockRejectedValue(
    Object.assign(new Error('permission denied for table platform_users'), { code: '42501' }),
  );

  await expect(createPgAdminPlatformUserStatsPort().readStats(WINDOW)).rejects.toThrow(
    /permission denied/,
  );
});
