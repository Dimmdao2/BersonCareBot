import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  drizzle: { select: vi.fn(), insert: vi.fn(), delete: vi.fn(), transaction: vi.fn(), execute: vi.fn() },
  runWebappPgText: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  getWebappSqlFromPgClient: vi.fn(),
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: fakes.runWebappPgText,
  runWebappSql: vi.fn(),
  webappSqlFromPgText: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: async () => 'Europe/Moscow',
}));

import { createPgProductAnalyticsPort } from '@/infra/repos/pgProductAnalytics';
import {
  aggregateProductAnalyticsUserHourly,
  buildAdminDashboard,
} from '@/modules/product-analytics/buildAdminDashboard';

const SNAPSHOT = {
  hourly: [
    {
      bucketHour: '2026-08-20T10:00:00.000Z',
      eventType: 'app_open',
      entryChannel: 'pwa',
      pageKey: '__all__',
      topicCode: '__all__',
      pushKind: '__all__',
      warmupSloganKey: '__all__',
      eventCount: 7,
    },
    {
      bucketHour: '2026-08-20T10:00:00.000Z',
      eventType: 'page_view',
      entryChannel: 'pwa',
      pageKey: '/app/patient/treatment/:id',
      topicCode: '__all__',
      pushKind: '__all__',
      warmupSloganKey: '__all__',
      eventCount: 4,
    },
  ],
  warmupSloganSamples: [{ sloganKey: 'wake-up', sampleText: 'Пора размяться' }],
  userAggregates: {
    totalActiveMinutes: 41,
    uniqueActiveUsers: 3,
    activeUsersDaily: [{ day: '2026-08-20', activeUsers: 3 }],
    pageUniqueUsers: [{ pageKey: '/app/patient/treatment/program', uniqueUsers: 2 }],
    pageUniqueUsersHourly: [
      { bucket: '2026-08-20T13:00:00', pageKey: '/app/patient/treatment/program', uniqueUsers: 2 },
    ],
  },
};

/** Всё, чем экран мог бы указать на конкретного человека. Ключи — как их пишет наш JSON. */
const PERSONAL_KEYS = [
  'userid',
  'displayname',
  'firstname',
  'lastname',
  'fullname',
  'fio',
  'phone',
  'email',
  'lastseenat',
  'clientactivity',
  'channels',
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function personalTraces(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => personalTraces(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => {
      const here = `${path}.${key}`;
      const hit = PERSONAL_KEYS.includes(key.toLowerCase()) ? [here] : [];
      return [...hit, ...personalTraces(v, here)];
    });
  }
  // Ключ страницы вида `/app/patient/reminders/journal/wp-<uuid>` — не человек; ловим только
  // значение, которое ЦЕЛИКОМ является идентификатором.
  if (typeof value === 'string' && UUID_RE.test(value.trim())) return [path];
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

it('экран «Приложение» получает числа через объявленную дверь, а не читает отношения', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: SNAPSHOT }] });

  const dashboard = await createPgProductAnalyticsPort().getAdminDashboard({
    windowHours: 168,
    audience: {
      includeTestAccounts: false,
      testPhones: ['+79990000009'],
      testTelegramIds: ['555'],
      testMaxIds: [],
    },
  });

  expect(dashboard.summary.uniqueActiveUsers).toBe(3);
  expect(dashboard.summary.totalActiveMinutes).toBe(41);
  expect(dashboard.summary.totalAppOpens).toBe(7);
  expect(dashboard.activeUsersDaily).toEqual([{ day: '2026-08-20', activeUsers: 3 }]);
  // Топ страниц берёт уникальных из ответа двери по УЖЕ схлопнутому ключу.
  expect(dashboard.topPages).toEqual([
    {
      pageKey: '/app/patient/treatment/program',
      pageLabel: 'Программа реабилитации',
      views: 4,
      uniqueUsers: 2,
    },
  ]);

  expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
  const [, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] ?? [];
  expect(identity).toBe(
    'app.read_product_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text,text)',
  );
  expect(args?.[2]).toBe('Europe/Moscow');
  // Прямое чтение телеметрии и `platform_users` под `app_platform_settings` — это 42501 и HTTP 500.
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
  expect(fakes.runWebappPgText).not.toHaveBeenCalled();
});

it('за дверь уезжают ИДЕНТИФИКАТОРЫ служебных учёток и правила схлопывания, а не готовые id', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: SNAPSHOT }] });

  await createPgProductAnalyticsPort().getAdminDashboard({
    windowHours: 24,
    audience: {
      includeTestAccounts: false,
      testPhones: ['+79990000009'],
      testTelegramIds: ['555'],
      testMaxIds: [],
    },
  });

  const args = fakes.runWebappNamedRoot.mock.calls[0]?.[2] ?? [];
  const audience = JSON.parse(String(args[3]));
  expect(audience.excludedPhones).toContain('+70000000000');
  expect(audience.excludedPhones).toContain('+79990000009');
  // Экран считает продуктовую активность — персонал из неё убирается, как и до правки.
  expect(audience.excludeStaffRoles).toBe(true);

  const pageGroups = JSON.parse(String(args[4]));
  expect(pageGroups.scopePrefix).toBe('/app/patient');
  expect(pageGroups.rules).toContainEqual({
    match: 'prefix',
    value: '/app/patient/treatment',
    group: '/app/patient/treatment/program',
  });
});

it('в ответе экрана нет ни одного поля с человеком — ни имени, ни контакта, ни id', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: SNAPSHOT }] });

  const dashboard = await createPgProductAnalyticsPort().getAdminDashboard({
    windowHours: 168,
    audience: {
      includeTestAccounts: false,
      testPhones: [],
      testTelegramIds: [],
      testMaxIds: [],
    },
  });

  expect(personalTraces(dashboard)).toEqual([]);
  expect(Object.keys(dashboard)).not.toContain('clientActivity');
});

it('ЛОВУШКА: проверка «нет людей в ответе» краснеет, если человек в ответе появится', () => {
  const poisoned = {
    ...SNAPSHOT,
    clientActivity: [
      {
        userId: 'b3f1a4c2-1d2e-4f3a-9b8c-7d6e5f4a3b2c',
        displayName: 'Иванов Иван',
        lastSeenAt: '2026-08-20T10:00:00.000Z',
      },
    ],
  };

  expect(personalTraces(poisoned).sort()).toEqual([
    '$.clientActivity',
    '$.clientActivity[0].displayName',
    '$.clientActivity[0].lastSeenAt',
    '$.clientActivity[0].userId',
    '$.clientActivity[0].userId',
  ]);
});

it('уникальные считаются ПОСЛЕ схлопывания: один человек в двух сырых ключах одной группы — это один', () => {
  const bucketHour = '2026-08-20T10:00:00.000Z';
  const aggregates = aggregateProductAnalyticsUserHourly(
    [
      {
        bucketHour,
        userId: 'u-1',
        entryChannel: 'pwa',
        pageKey: '/app/patient/treatment/:id',
        appOpens: 0,
        pageViews: 3,
        pushOpens: 0,
        activeMinutes: 0,
        lastSeenAt: null,
      },
      {
        bucketHour,
        userId: 'u-1',
        entryChannel: 'pwa',
        pageKey: '/app/patient/treatment',
        appOpens: 0,
        pageViews: 2,
        pushOpens: 0,
        activeMinutes: 0,
        lastSeenAt: null,
      },
    ],
    { displayTimezone: 'Europe/Moscow', startHourInclusive: '2026-08-20T00:00:00.000Z' },
  );

  expect(aggregates.uniqueActiveUsers).toBe(1);
  expect(aggregates.pageUniqueUsers).toEqual([
    { pageKey: '/app/patient/treatment/program', uniqueUsers: 1 },
  ]);

  // И тот же ответ доезжает до экрана целым числом, а не суммой двух сырых ключей.
  const dashboard = buildAdminDashboard({
    windowHours: 24,
    displayTimezone: 'Europe/Moscow',
    startHourInclusive: '2026-08-20T00:00:00.000Z',
    hourlyRows: [
      {
        bucketHour,
        eventType: 'page_view',
        entryChannel: 'pwa',
        pageKey: '/app/patient/treatment/:id',
        topicCode: '__all__',
        pushKind: '__all__',
        warmupSloganKey: '__all__',
        eventCount: 5,
      },
    ],
    userAggregates: aggregates,
  });
  expect(dashboard.topPages[0]?.uniqueUsers).toBe(1);
});

it('пустой ответ двери не превращается в NaN на экране', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [] });

  const dashboard = await createPgProductAnalyticsPort().getAdminDashboard({
    windowHours: 168,
    audience: {
      includeTestAccounts: false,
      testPhones: [],
      testTelegramIds: [],
      testMaxIds: [],
    },
  });

  expect(dashboard.summary.uniqueActiveUsers).toBe(0);
  expect(dashboard.summary.totalActiveMinutes).toBe(0);
  expect(dashboard.activeUsersDaily).toEqual([]);
  expect(dashboard.topPages).toEqual([]);
});

it('отказ двери всплывает наверх, а не подменяется нулями', async () => {
  fakes.runWebappNamedRoot.mockRejectedValue(
    Object.assign(new Error('permission denied for function read_product_analytics_dashboard'), {
      code: '42501',
    }),
  );

  await expect(
    createPgProductAnalyticsPort().getAdminDashboard({
      windowHours: 168,
      audience: {
        includeTestAccounts: false,
        testPhones: [],
        testTelegramIds: [],
        testMaxIds: [],
      },
    }),
  ).rejects.toThrow(/permission denied/);
});
