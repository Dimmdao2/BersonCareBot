/**
 * Граница ручной записи симптома пациентом (#1095, Work3): чужой/служебный трекинг не пишется,
 * а история чужого трекинга не читается.
 *
 * Каждая проверка названа поломкой, которую ловит:
 * 1. `addSymptomEntry` перестал сверять `trackingId` со СВОИМИ трекингами → отметка уходит в дневник
 *    другого пациента (запись специальной категории ПДн не тому человеку, молча).
 * 2. `addSymptomEntry` перестал отбивать служебный `general_wellbeing` → ручная запись симптома
 *    подмешивается в домашний чек-ин самочувствия, и недельный график врёт.
 * 3. `GET /api/patient/diary/symptom-stats` читает записи до/без проверки владельца трекинга →
 *    любой пациент вытягивает чужую историю симптома по её id.
 * 4. `fillDays=1` перестал отдавать пустые календарные дни → пропуски схлопываются, и точки на
 *    горизонтальном таймлайне встают вплотную, показывая непрерывное наблюдение там, где его не было.
 *
 * Оба субъекта вызываются как настоящие публичные входы (server action и route handler) поверх
 * поддельного `buildAppDeps()`; порты записи/чтения — шпионы, чтобы «не вызвано» было утверждением.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  requirePatientAccessWithPhone: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
  requirePatientAccessWithPhone: fakes.requirePatientAccessWithPhone,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { addSymptomEntry } from '@/app/app/patient/diary/symptoms/actions';
import { GET as getSymptomStats } from '@/app/api/patient/diary/symptom-stats/route';

const PATIENT_ID = '00000000-0000-4000-8000-000000001095';
const OWN_TRACKING_ID = 'tracking-own';
const FOREIGN_TRACKING_ID = 'tracking-of-another-patient';

function entryForm(trackingId: string, value: string, entryType: string): FormData {
  const form = new FormData();
  form.set('trackingId', trackingId);
  form.set('value', value);
  form.set('entryType', entryType);
  return form;
}

function statsRequest(query: Record<string, string>): Request {
  const url = new URL('https://app.example.test/api/patient/diary/symptom-stats');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url, { method: 'GET' });
}

describe('patient symptom entry: write boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requirePatientAccessWithPhone.mockResolvedValue({ user: { userId: PATIENT_ID } });
  });

  it('refuses an entry for a tracking that is not the caller’s own and writes nothing', async () => {
    const addEntryPort = vi.fn().mockResolvedValue(undefined);
    fakes.buildAppDeps.mockReturnValue({
      diaries: {
        // Порт списка отдаёт ТОЛЬКО трекинги вызывающего — чужого id здесь нет.
        listSymptomTrackings: vi
          .fn()
          .mockResolvedValue([{ id: OWN_TRACKING_ID, symptomKey: 'knee_pain' }]),
        listSymptomEntriesForTrackingInRange: vi.fn().mockResolvedValue([]),
        addSymptomEntry: addEntryPort,
      },
    });

    const result = await addSymptomEntry(entryForm(FOREIGN_TRACKING_ID, '7', 'instant'));

    expect(result.ok).toBe(false);
    expect(addEntryPort).not.toHaveBeenCalled();
  });

  it('refuses an entry for the service general_wellbeing tracking and writes nothing', async () => {
    const addEntryPort = vi.fn().mockResolvedValue(undefined);
    fakes.buildAppDeps.mockReturnValue({
      diaries: {
        listSymptomTrackings: vi
          .fn()
          .mockResolvedValue([{ id: OWN_TRACKING_ID, symptomKey: 'general_wellbeing' }]),
        listSymptomEntriesForTrackingInRange: vi.fn().mockResolvedValue([]),
        addSymptomEntry: addEntryPort,
      },
    });

    const result = await addSymptomEntry(entryForm(OWN_TRACKING_ID, '7', 'instant'));

    expect(result.ok).toBe(false);
    expect(addEntryPort).not.toHaveBeenCalled();
  });
});

describe('GET /api/patient/diary/symptom-stats: read boundary and calendar days', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: PATIENT_ID } },
    });
  });

  it('answers 404 for a tracking the caller does not own without reading any entries', async () => {
    const listEntriesPort = vi.fn().mockResolvedValue([]);
    fakes.buildAppDeps.mockReturnValue({
      diaries: {
        // Владелец не найден → чтения записей быть не должно вовсе.
        getSymptomTrackingForUser: vi.fn().mockResolvedValue(null),
        listSymptomEntriesForTrackingInRange: listEntriesPort,
        minRecordedAtForSymptomTracking: vi.fn().mockResolvedValue(null),
      },
    });

    const response = await getSymptomStats(
      statsRequest({ trackingId: FOREIGN_TRACKING_ID, period: 'week' }),
    );

    expect(response.status).toBe(404);
    expect(listEntriesPort).not.toHaveBeenCalled();
  });

  it('fillDays=1 returns every calendar day of the window, empty days as null', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
      fakes.buildAppDeps.mockReturnValue({
        diaries: {
          getSymptomTrackingForUser: vi
            .fn()
            .mockResolvedValue({ id: OWN_TRACKING_ID, symptomKey: 'knee_pain' }),
          listSymptomEntriesForTrackingInRange: vi.fn().mockResolvedValue([
            { recordedAt: '2026-03-05T09:00:00.000Z', value0_10: 4, entryType: 'instant' },
            { recordedAt: '2026-03-09T19:00:00.000Z', value0_10: 7, entryType: 'instant' },
          ]),
          minRecordedAtForSymptomTracking: vi.fn().mockResolvedValue(null),
        },
      });

      const filled = (await (
        await getSymptomStats(
          statsRequest({ trackingId: OWN_TRACKING_ID, period: 'week', fillDays: '1' }),
        )
      ).json()) as { points: { date: string; instant: number | null }[] };

      expect(filled.points.map((p) => p.date)).toEqual([
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
        '2026-03-10',
      ]);
      expect(filled.points.map((p) => p.instant)).toEqual([null, 4, null, null, null, 7, null]);

      // Без флага — прежняя разреженная форма ответа для остальных потребителей.
      const sparse = (await (
        await getSymptomStats(statsRequest({ trackingId: OWN_TRACKING_ID, period: 'week' }))
      ).json()) as { points: { date: string }[] };

      expect(sparse.points.map((p) => p.date)).toEqual(['2026-03-05', '2026-03-09']);
    } finally {
      vi.useRealTimers();
    }
  });
});
