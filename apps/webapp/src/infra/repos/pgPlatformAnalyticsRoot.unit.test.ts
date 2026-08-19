import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  drizzle: { select: vi.fn(), transaction: vi.fn(), execute: vi.fn() },
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: vi.fn(),
  webappSqlFromPgText: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import { createPgPlatformAnalyticsPort } from '@/infra/repos/pgPlatformAnalytics';

const SNAPSHOT = {
  clinics: { now: 4, inPeriod: 2, byDay: { '2026-08-18': 1, '2026-08-19': 1 } },
  specialists: { now: 6, inPeriod: 1, byDay: { '2026-08-19': 1 } },
  patients: { now: 239, inPeriod: 3, byDay: { '2026-08-19': 3 } },
  pageViews: [
    { pageKey: '/app/patient/cabinet', entryChannel: 'browser', views: 6 },
    { pageKey: '/app/patient/warmup', entryChannel: 'telegram', views: 11 },
  ],
  bookings: { created: 329, cancelled: 17 },
  programsAssigned: 78,
  clinicalVisits: 1,
  cmsArticlesCreated: 4,
  exercises: {
    created: 142,
    creators: 1,
    personal: 0,
    catalog: 142,
    mediaUrls: [
      { url: '/api/media/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', count: 3 },
      { url: 'https://youtu.be/abc', count: 2 },
    ],
  },
  videoVolumeExercises: {
    originalsBytes: 12651045821,
    videoCount: 135,
    durationBuckets: { le3: 100, m3_5: 20, m5_7: 5, m7_10: 4, m10_15: 3, m15_20: 2, over20: 1, unknown: 0 },
  },
  videoVolumeCms: {
    originalsBytes: 2501617866,
    videoCount: 2,
    durationBuckets: { le3: 1, m3_5: 0, m5_7: 0, m7_10: 0, m10_15: 0, m15_20: 0, over20: 0, unknown: 1 },
  },
  completions: { completions: 1627, withRepsOrDifficulty: 1325 },
  homeWellbeingMarks: 401,
  programActivity: { patientsWithProgram: 55, visitDaysSum: 373, markDaysSum: 257 },
  playback: {
    viewsTotal: 2179,
    viewsUnique: 421,
    hlsResolves: 2173,
    mp4Resolves: 0,
    playbackErrors: 31,
    byDay: { '2026-08-19': 12 },
  },
};

const WINDOW = {
  iana: 'Europe/Moscow',
  startUtcIso: '2026-08-12T21:00:00.000Z',
  endExclusiveUtcIso: '2026-08-19T21:00:00.000Z',
  dayKeys: ['2026-08-19'],
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

it('глобальный админ получает настоящие числа, а не пустой дашборд', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: SNAPSHOT }] });

  const snapshot = await createPgPlatformAnalyticsPort().readSnapshot(WINDOW);

  expect(snapshot.clinics.now).toBe(4);
  expect(snapshot.clinics.byDay.get('2026-08-18')).toBe(1);
  expect(snapshot.bookings).toEqual({ created: 329, cancelled: 17 });
  expect(snapshot.clinicalVisits).toBe(1);
  expect(snapshot.completions.withRepsOrDifficulty).toBe(1325);
  expect(snapshot.videoVolumeExercises.originalsBytes).toBe(12651045821);
  expect(snapshot.videoVolumeCms.durationBuckets.unknown).toBe(1);
  expect(snapshot.playback.byDay.get('2026-08-19')).toBe(12);
  expect(snapshot.pageViews).toHaveLength(2);
});

it('файл библиотеки и ссылка хостинга расходятся по своим счётчикам', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: SNAPSHOT }] });

  const snapshot = await createPgPlatformAnalyticsPort().readSnapshot(WINDOW);

  expect(snapshot.exercises.videoFiles).toBe(3);
  expect(snapshot.exercises.videoIframe).toBe(2);
});

it('дашборд идёт через объявленную дверь, а не читает отношения напрямую', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: SNAPSHOT }] });

  await createPgPlatformAnalyticsPort().readSnapshot(WINDOW);

  const [, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] ?? [];
  expect(identity).toBe(
    'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)',
  );
  expect(args?.slice(0, 3)).toEqual([
    '2026-08-12T21:00:00.000Z',
    '2026-08-19T21:00:00.000Z',
    'Europe/Moscow',
  ]);
  // Прямое чтение отношения здесь — это 42501 на семнадцати таблицах из девятнадцати и HTTP 500
  // на всей странице: вызовы стояли в голом `Promise.all`.
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('тестовые учётки уходят за дверь списком, а не остаются в цифрах', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: SNAPSHOT }] });

  await createPgPlatformAnalyticsPort().readSnapshot(WINDOW);

  const audience = JSON.parse(String(fakes.runWebappNamedRoot.mock.calls[0]?.[2]?.[3]));
  expect(audience.excludeStaffRoles).toBe(true);
  expect(audience.staffRoles).toEqual(['admin', 'doctor']);
  expect(audience.excludedPhones).toContain('+70000000000');
  expect(audience.excludedPhones).toContain('+79990000009');
  expect(audience.telegramIds).toEqual(['555']);
});

it('пустой ответ двери не превращается в NaN на экране', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [] });

  const snapshot = await createPgPlatformAnalyticsPort().readSnapshot(WINDOW);

  expect(snapshot.clinics.now).toBe(0);
  expect(snapshot.videoVolumeExercises.durationBuckets.le3).toBe(0);
  expect(snapshot.pageViews).toEqual([]);
});

it('отказ двери всплывает наверх, а не подменяется нулями', async () => {
  fakes.runWebappNamedRoot.mockRejectedValue(
    Object.assign(new Error('permission denied for table clinical_visit'), { code: '42501' }),
  );

  await expect(createPgPlatformAnalyticsPort().readSnapshot(WINDOW)).rejects.toThrow(
    /permission denied/,
  );
});
