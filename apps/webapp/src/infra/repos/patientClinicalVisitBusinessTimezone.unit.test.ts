/**
 * ENCOUNTER-PAGE-05: время приёма в шапке страницы приёма приходит из `listVisits` и обязано быть
 * в бизнес-таймзоне приложения (`system_settings.app_display_timezone`), а не в UTC и не в
 * зашитой Москве.
 *
 * Ловимая поломка: визит, сохранённый как `2026-09-06T21:30:00Z`, при бизнес-поясе
 * `Europe/Moscow` показывается как «6 сентября 2026 · 21:30» вместо «7 сентября 2026 · 00:30»,
 * то есть специалист видит чужой день и чужой час рядом со связанной календарной записью.
 * Отказ молчаливый (страница отрисована, число просто не то) и дорогой (перепутанный приём).
 *
 * Пояс `Asia/Novosibirsk` (+7) во втором случае отличается и от UTC, и от Москвы — поэтому тест
 * краснеет и на возврате к UTC, и на подстановке компилированной Москвы.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getDrizzle: vi.fn(),
  getAppDisplayTimeZone: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => undefined,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getAppDisplayTimeZone,
}));

import { createPgPatientClinicalPort } from './pgPatientClinical';
import { inMemoryPatientClinicalPort } from './inMemoryPatientClinical';

/** Дневник симптомов в чтении визитов не участвует — порт только удовлетворяет конструктор. */
function symptomDiaryMirrorStub() {
  const unused = () => {
    throw new Error('symptom diary is not used by listVisits');
  };
  return {
    createTracking: unused,
    addEntry: unused,
    setTrackingActive: unused,
  } as unknown as Parameters<typeof createPgPatientClinicalPort>[0]['diaries'];
}

const VISIT_UTC_INSTANT = '2026-09-06T21:30:00.000Z';
const PATIENT_ID = '11111111-1111-4111-8111-111111111111';

/** Drizzle-чейн `select().from().where().orderBy()`, отдающий подготовленные строки по очереди. */
function drizzleReturning(...resultsInOrder: unknown[][]) {
  const queue = [...resultsInOrder];
  const chain = () => {
    const rows = queue.shift() ?? [];
    const thenable = {
      from: () => thenable,
      where: () => thenable,
      orderBy: () => Promise.resolve(rows),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return thenable;
  };
  return { select: chain, execute: async () => ({ rows: [] }) };
}

describe('время приёма в бизнес-таймзоне (ENCOUNTER-PAGE-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { zone: 'Europe/Moscow', date: '7 сентября 2026', time: '00:30' },
    { zone: 'Asia/Novosibirsk', date: '7 сентября 2026', time: '04:30' },
  ])('pg-порт отдаёт визит в поясе $zone', async ({ zone, date, time }) => {
    fakes.getAppDisplayTimeZone.mockResolvedValue(zone);
    fakes.getDrizzle.mockReturnValue(
      drizzleReturning(
        [
          {
            id: '22222222-2222-4222-8222-222222222222',
            patientUserId: PATIENT_ID,
            canonicalAppointmentId: null,
            visitedAt: VISIT_UTC_INSTANT,
            visitType: 'repeat',
            location: null,
            duration: null,
            anamnesisText: null,
            service: null,
            exam: null,
            manipulations: null,
            trialResults: null,
            recommendations: null,
          },
        ],
        [],
        [],
      ),
    );

    const [visit] = await createPgPatientClinicalPort({
      diaries: symptomDiaryMirrorStub(),
    }).listVisits(PATIENT_ID);

    expect(visit.time).toBe(time);
    expect(visit.date).toBe(date);
  });

  it.each([
    { zone: 'Europe/Moscow', date: '7 сентября 2026', time: '00:30' },
    { zone: 'Asia/Novosibirsk', date: '7 сентября 2026', time: '04:30' },
  ])('in-memory-порт отдаёт визит в поясе $zone', async ({ zone, date, time }) => {
    fakes.getAppDisplayTimeZone.mockResolvedValue(zone);
    const patientUserId = `patient-${zone}`;
    await inMemoryPatientClinicalPort.createVisit({
      patientUserId,
      visitType: 'repeat',
      visitedAt: VISIT_UTC_INSTANT,
      createdBy: 'doctor-1',
    });

    const [visit] = await inMemoryPatientClinicalPort.listVisits(patientUserId);

    expect(visit.time).toBe(time);
    expect(visit.date).toBe(date);
  });
});
