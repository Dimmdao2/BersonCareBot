/**
 * Мост «врачебная жалоба → отслеживание симптома пациента» (owner 08.09.2026: «если доктор добавил
 * симптом, у пациента как бы этот симптом привязан»).
 *
 * Ловимые поломки — все молчаливые: интерфейс врача отвечает 201/200, жалоба в карте есть, а у
 * пациента симптома нет вовсе либо он живёт своей жизнью.
 *
 * 1. Вход «жалоба из карты» / «жалоба на первичном приёме» / «уточнение жалобы на повторном приёме»
 *    не заводит отслеживание или не пишет замер → пациент не видит симптом и не может его вести.
 * 2. Повторный замер по уже связанной жалобе заводит ВТОРОЕ отслеживание → история симптома рвётся
 *    на два графика, врач и пациент смотрят разные линии.
 * 3. Снятие жалобы удаляет отслеживание вместо гашения → история замеров пропадает безвозвратно;
 *    возврат жалобы в работу не поднимает отслеживание → пациент больше не может добавлять записи.
 * 4. Чужой (другой пациент / другая организация) `complaintId` доходит до дневника → запись
 *    появляется в карточке постороннего человека. Спецкатегория ПДн, отказ невидим.
 *
 * Oracle — требование владельца и worker-brief `patient-clinical-symptom-bridge-20260908.md`
 * (п. 1–4, 6), не реализация: тест фиксирует ЧТО должно доехать до дневника, а не как это устроено
 * внутри репозитория.
 *
 * Слой: unit по публичному API `createPgPatientClinicalPort` — самый дешёвый, который видит весь
 * этот класс. Гарантий RLS/БД этот файл не заявляет: они доказываются живым слоем.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import type { SymptomDiaryPort } from '@/modules/diaries/ports';

const fakes = vi.hoisted(() => ({
  getDrizzle: vi.fn(),
  organizationId: { current: null as string | null },
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => fakes.organizationId.current ?? undefined,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

import { createPgPatientClinicalPort } from './pgPatientClinical';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '99999999-9999-4999-8999-999999999999';
const PATIENT_ID = '22222222-2222-4222-8222-222222222222';
const COMPLAINT_ID = '33333333-3333-4333-8333-333333333333';
const VISIT_ID = '44444444-4444-4444-8444-444444444444';
const TRACKING_ID = '55555555-5555-4555-8555-555555555555';
const EXISTING_TRACKING_ID = '66666666-6666-4666-8666-666666666666';

type Recorded = {
  inserts: { table: string; values: Record<string, unknown> }[];
  updates: { table: string; set: Record<string, unknown> }[];
  selectCalls: number;
};

/**
 * Drizzle-двойник транзакции. Ответы `select` задаёт тест очередью — так сценарий читается как
 * состояние базы («жалоба такая-то есть / связанного отслеживания нет»), а не как цепочка вызовов.
 */
function fakeTransaction(selectResults: unknown[][], insertReturning: Record<string, unknown[]>) {
  const recorded: Recorded = { inserts: [], updates: [], selectCalls: 0 };
  const queue = [...selectResults];

  const tx = {
    execute: async () => ({ rows: [] }),
    select() {
      recorded.selectCalls += 1;
      const rows = queue.shift() ?? [];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.from = self;
      chain.innerJoin = self;
      chain.leftJoin = self;
      chain.where = self;
      chain.orderBy = self;
      chain.limit = async () => rows;
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return chain;
    },
    insert(table: unknown) {
      const name = getTableName(table as never);
      return {
        values(values: Record<string, unknown>) {
          recorded.inserts.push({ table: name, values });
          const result = insertReturning[name] ?? [];
          return {
            returning: async () => result,
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(result).then(resolve),
          };
        },
      };
    },
    update(table: unknown) {
      const name = getTableName(table as never);
      return {
        set(values: Record<string, unknown>) {
          recorded.updates.push({ table: name, set: values });
          const result = [{ id: COMPLAINT_ID }];
          const chain = {
            where: () => chain,
            returning: async () => result,
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(result).then(resolve),
          };
          return chain;
        },
      };
    },
  };

  fakes.getDrizzle.mockReturnValue({
    ...tx,
    transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
  });
  return recorded;
}

/** Дневник симптомов — граница; двойник записывает ровно то, что мост попросил у пациента. */
function fakeDiaries(trackingId = TRACKING_ID) {
  const createTracking = vi.fn(async (params: { symptomTitle: string }) => ({
    id: trackingId,
    symptomTitle: params.symptomTitle,
  }));
  const addEntry = vi.fn(async (_params: SymptomDiaryPort['addEntry'] extends (p: infer P) => unknown ? P : never) => ({
    id: 'entry',
  }));
  const setTrackingActive = vi.fn(async () => undefined);
  const softDeleteTracking = vi.fn(async () => undefined);
  return {
    port: { createTracking, addEntry, setTrackingActive, softDeleteTracking } as never,
    createTracking,
    addEntry,
    setTrackingActive,
    softDeleteTracking,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.organizationId.current = ORGANIZATION_ID;
});

describe('жалоба врача ведёт отслеживание симптома у пациента', () => {
  it('жалоба из карты заводит ровно одно отслеживание, связывает его с жалобой и пишет первый замер', async () => {
    const recorded = fakeTransaction([[]], {
      clinical_complaint: [{ id: COMPLAINT_ID }],
    });
    const diaries = fakeDiaries();

    const id = await createPgPatientClinicalPort({ diaries: diaries.port }).createComplaint({
      patientUserId: PATIENT_ID,
      text: 'Боль в колене',
      priority: false,
      severity: 7,
      patientSymptomTrackingEnabled: true,
    });

    expect(id).toBe(COMPLAINT_ID);
    expect(diaries.createTracking).toHaveBeenCalledTimes(1);
    expect(diaries.createTracking).toHaveBeenCalledWith({
      userId: PATIENT_ID,
      symptomTitle: 'Боль в колене',
      patientTrackingEnabled: true,
    });
    // Связь durable: id отслеживания лёг в саму жалобу, а не выводится потом по названию.
    expect(recorded.updates).toContainEqual({
      table: 'clinical_complaint',
      set: { symptomTrackingId: TRACKING_ID },
    });
    expect(diaries.addEntry).toHaveBeenCalledTimes(1);
    expect(diaries.addEntry.mock.calls[0][0]).toMatchObject({
      userId: PATIENT_ID,
      trackingId: TRACKING_ID,
      value0_10: 7,
      entryType: 'instant',
    });
  });

  it('повторный замер по связанной жалобе пишет в то же отслеживание и не заводит второе', async () => {
    fakeTransaction(
      [
        [{ organizationId: ORGANIZATION_ID, text: 'Боль в колене' }],
        [{ trackingId: EXISTING_TRACKING_ID }],
      ],
      {},
    );
    const diaries = fakeDiaries();

    const ok = await createPgPatientClinicalPort({ diaries: diaries.port }).appendComplaintUpdate({
      patientUserId: PATIENT_ID,
      complaintId: COMPLAINT_ID,
      severity: 4,
      resolved: false,
    });

    expect(ok).toBe(true);
    expect(diaries.createTracking).not.toHaveBeenCalled();
    expect(diaries.addEntry).toHaveBeenCalledTimes(1);
    expect(diaries.addEntry.mock.calls[0][0]).toMatchObject({
      trackingId: EXISTING_TRACKING_ID,
      value0_10: 4,
      entryType: 'instant',
    });
  });

  it('снятие жалобы гасит отслеживание и сохраняет историю, возврат в работу поднимает его', async () => {
    for (const resolved of [true, false]) {
      vi.clearAllMocks();
      fakeTransaction(
        [
          [{ organizationId: ORGANIZATION_ID, text: 'Боль в колене' }],
          [{ trackingId: EXISTING_TRACKING_ID }],
        ],
        {},
      );
      const diaries = fakeDiaries();

      await createPgPatientClinicalPort({ diaries: diaries.port }).appendComplaintUpdate({
        patientUserId: PATIENT_ID,
        complaintId: COMPLAINT_ID,
        severity: 2,
        resolved,
      });

      expect(diaries.setTrackingActive).toHaveBeenCalledWith({
        userId: PATIENT_ID,
        trackingId: EXISTING_TRACKING_ID,
        isActive: !resolved,
      });
      // История замеров не трогается ни в одну, ни в другую сторону.
      expect(diaries.softDeleteTracking).not.toHaveBeenCalled();
      expect(diaries.addEntry).toHaveBeenCalledTimes(1);
    }
  });

  it('жалоба, заведённая на первичном приёме, тоже доходит до дневника пациента', async () => {
    const recorded = fakeTransaction([], {
      clinical_visit: [{ id: VISIT_ID }],
      clinical_complaint: [{ id: COMPLAINT_ID }],
    });
    const diaries = fakeDiaries();

    await createPgPatientClinicalPort({ diaries: diaries.port }).createVisit({
      patientUserId: PATIENT_ID,
      visitType: 'first',
      visitedAt: '2026-09-08T09:00:00.000Z',
      createdBy: 'doctor-1',
      complaints: [{ text: 'Головная боль', priority: false, severity: 6 }],
      patientSymptomTrackingEnabled: true,
    });

    expect(diaries.createTracking).toHaveBeenCalledTimes(1);
    expect(diaries.createTracking.mock.calls[0][0]).toMatchObject({
      userId: PATIENT_ID,
      symptomTitle: 'Головная боль',
    });
    expect(recorded.updates).toContainEqual({
      table: 'clinical_complaint',
      set: { symptomTrackingId: TRACKING_ID },
    });
    expect(diaries.addEntry.mock.calls[0][0]).toMatchObject({
      trackingId: TRACKING_ID,
      value0_10: 6,
      entryType: 'instant',
      recordedAt: '2026-09-08T09:00:00.000Z',
    });
  });

  it('уточнение жалобы на повторном приёме пишет замер в связанное отслеживание', async () => {
    fakeTransaction(
      [
        [{ organizationId: ORGANIZATION_ID, text: 'Головная боль' }],
        [{ trackingId: EXISTING_TRACKING_ID }],
      ],
      { clinical_visit: [{ id: VISIT_ID }] },
    );
    const diaries = fakeDiaries();

    await createPgPatientClinicalPort({ diaries: diaries.port }).createVisit({
      patientUserId: PATIENT_ID,
      visitType: 'repeat',
      visitedAt: '2026-09-08T10:00:00.000Z',
      createdBy: 'doctor-1',
      complaintUpdates: [{ complaintId: COMPLAINT_ID, severity: 3, note: '', resolved: false }],
      patientSymptomTrackingEnabled: true,
    });

    expect(diaries.createTracking).not.toHaveBeenCalled();
    expect(diaries.addEntry).toHaveBeenCalledTimes(1);
    expect(diaries.addEntry.mock.calls[0][0]).toMatchObject({
      userId: PATIENT_ID,
      trackingId: EXISTING_TRACKING_ID,
      value0_10: 3,
      recordedAt: '2026-09-08T10:00:00.000Z',
    });
  });

  it('чужая жалоба (другой пациент или другая организация) не доходит до дневника', async () => {
    // Жалоба не найдена под принципалом врача — карточка постороннего человека остаётся нетронутой.
    fakeTransaction([[]], {});
    const diaries = fakeDiaries();

    const ok = await createPgPatientClinicalPort({ diaries: diaries.port }).appendComplaintUpdate({
      patientUserId: PATIENT_ID,
      complaintId: COMPLAINT_ID,
      severity: 9,
      resolved: false,
    });

    expect(ok).toBe(false);
    expect(diaries.createTracking).not.toHaveBeenCalled();
    expect(diaries.addEntry).not.toHaveBeenCalled();
    expect(diaries.setTrackingActive).not.toHaveBeenCalled();
  });

  it('жалоба чужой организации на повторном приёме отказывает и не пишет в дневник', async () => {
    fakeTransaction([[{ organizationId: OTHER_ORGANIZATION_ID, text: 'Боль в колене' }]], {
      clinical_visit: [{ id: VISIT_ID }],
    });
    const diaries = fakeDiaries();

    await expect(
      createPgPatientClinicalPort({ diaries: diaries.port }).createVisit({
        patientUserId: PATIENT_ID,
        visitType: 'repeat',
        visitedAt: '2026-09-08T10:00:00.000Z',
        createdBy: 'doctor-1',
        complaintUpdates: [{ complaintId: COMPLAINT_ID, severity: 8, note: '', resolved: false }],
      }),
    ).rejects.toThrow('organization_principal_mismatch');

    expect(diaries.addEntry).not.toHaveBeenCalled();
    expect(diaries.createTracking).not.toHaveBeenCalled();
  });
});
