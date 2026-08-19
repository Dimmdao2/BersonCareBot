import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Что сломается без этого теста.
 *
 * 1. Анонимная воронка снова читает таблицы напрямую. У класса контекста `tenant_service` сквозного
 *    реляционного доступа нет и по `SCHEME.md` §3 не будет — любое такое чтение отвергается ДО
 *    отправки statement'а, и посетитель опубликованной клиники получает «Каталог недоступен».
 *    Именно так публичная запись стояла с 12.08. Отказ дорогой (записаться снаружи нельзя ни в одну
 *    клинику) и молчаливый (в логе Postgres нет ничего — statement туда не доехал).
 *
 * 2. Неопубликованная клиника перестаёт быть невидимой. Двери из 0043 отдают на неё `NULL`; если
 *    приложение трактует `NULL` как «читаем как раньше» или достраивает его умолчанием, снаружи
 *    становится видно то, что клиника не публиковала.
 *
 * 3. Филиал ЧУЖОЙ организации проходит по публичному пути. Дверь не найдёт его в контексте, но
 *    согласование с организацией слага живёт в приложении, и его легко потерять правкой.
 *
 * 4. Две настройки записи читаются реляционно. Они приезжают ВНУТРИ снимка слотов; чтение
 *    `system_settings` под этим классом — тот же отказ, что и §1, только на шаге создания записи.
 *
 * Oracle — контракт миграции `0043_the_public_funnel_had_no_door_of_its_own.sql`: формы jsonb,
 * `NULL` на неопубликованной клинике и точные идентичности корней.
 */
const fakes = vi.hoisted(() => ({
  runWebappNamedRoot: vi.fn(),
  getDrizzle: vi.fn(() => {
    throw new Error('relational read attempted under the tenant-service class');
  }),
  getServerRuntimeInteger: vi.fn(async () => {
    throw new Error('runtime setting read attempted under the tenant-service class');
  }),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: vi.fn(async () => {
    throw new Error('untyped query text attempted under the tenant-service class');
  }),
  runWebappTransaction: vi.fn(),
  getWebappSqlFromPgClient: vi.fn(),
  runWebappSql: vi.fn(),
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));
vi.mock('@/infra/db/drizzleMutationTx', () => ({ getDrizzleOrMutationTx: fakes.getDrizzle }));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getServerRuntimeInteger: fakes.getServerRuntimeInteger,
  getConfigValue: vi.fn(),
}));

import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { createPgBookingSchedulingPort } from './pgBookingScheduling';
import { createPgBookingEnginePort } from './pgBookingEngine';
import { createPgBookingFormPort } from './pgBookingForm';

const ORG = '53000000-0000-4000-8000-0000000000a1';
const OTHER_ORG = '53000000-0000-4000-8000-0000000000b2';
const BRANCH = '53000000-0000-4000-8000-0000000000c3';
const SERVICE = '53000000-0000-4000-8000-0000000000d4';
const SPECIALIST = '53000000-0000-4000-8000-0000000000e5';
const WORKING_DAY = '53000000-0000-4000-8000-0000000000f6';

const PUBLIC_SOURCE = 'app/book/[slug]:load-cities';

function branchPayload(organizationId = ORG) {
  return {
    id: BRANCH,
    organizationId,
    title: 'Пресня',
    shortTitle: null,
    color: null,
    cityCode: 'moscow',
    address: null,
    timezone: 'Europe/Moscow',
    isActive: true,
    sortOrder: 10,
  };
}

function servicePayload(organizationId = ORG) {
  return {
    id: SERVICE,
    organizationId,
    title: 'Первичный приём',
    description: null,
    durationMinutes: 60,
    bufferAfterMinutes: 0,
    priceMinor: 500000,
    prepaymentApplicable: false,
    usableInPackages: false,
    onlinePaymentApplicable: false,
    sortOrder: 10,
    isActive: true,
  };
}

function slotSnapshotPayload() {
  return {
    context: {
      organizationId: ORG,
      branchId: BRANCH,
      specialistId: SPECIALIST,
      serviceId: SERVICE,
      roomId: null,
      durationMinutes: 60,
      bufferAfterMinutes: 0,
      branchTimezone: 'Europe/Moscow',
    },
    workingHours: [{ weekday: 3, startMinute: 600, endMinute: 720 }],
    workingDays: [
      {
        id: WORKING_DAY,
        organizationId: ORG,
        specialistId: SPECIALIST,
        branchId: BRANCH,
        roomId: null,
        workDate: '2026-08-19',
        startMinute: 600,
        endMinute: 720,
        breaks: [],
        isClosed: false,
      },
    ],
    busy: [],
    bufferMinutes: 0,
    minNoticeHours: 0,
    maxConsecutiveSlotHours: 4,
  };
}

/** Отвечает по ТОЧНОЙ идентичности корня — неизвестная идентичность роняет тест, а не молчит. */
function doorsAnswering(answers: Record<string, unknown>) {
  return async (_db: unknown, functionIdentity: string) => {
    if (!(functionIdentity in answers)) {
      throw new Error(`unexpected named root: ${functionIdentity}`);
    }
    const value = answers[functionIdentity];
    const column =
      functionIdentity === 'app.read_public_booking_catalog(uuid,uuid)'
        ? 'catalog'
        : functionIdentity === 'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)'
          ? 'snapshot'
          : functionIdentity === 'app.list_public_booking_form_fields()'
            ? 'fields'
            : 'organization_id';
    return { rows: [{ [column]: value }] };
  };
}

function underPublicPrincipal<T>(fn: () => Promise<T>, source = PUBLIC_SOURCE): Promise<T> {
  return withExplicitOrganizationPrincipal({ organizationId: ORG, source }, fn);
}

const scheduling = createPgBookingSchedulingPort();
const engine = createPgBookingEnginePort();
const form = createPgBookingFormPort();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('public booking — every read goes through a named root, never through a relation', () => {
  it('serves a published clinic its branches, its service and its slots from the doors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T05:00:00.000Z'));
    fakes.runWebappNamedRoot.mockImplementation(
      doorsAnswering({
        'app.read_public_booking_catalog(uuid,uuid)': {
          branches: [branchPayload()],
          branch: branchPayload(),
          services: [servicePayload()],
          service: servicePayload(),
        },
        'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)': slotSnapshotPayload(),
      }),
    );

    const result = await underPublicPrincipal(async () => {
      const branches = await engine.listBranches(ORG);
      const services = await engine.listPublicBookableServicesForBranch({
        organizationId: ORG,
        branchId: BRANCH,
      });
      const context = await scheduling.resolveCanonicalInPersonContext({
        organizationId: ORG,
        branchId: BRANCH,
        serviceId: SERVICE,
      });
      const slots = await scheduling.getSlots({
        organizationId: ORG,
        branchId: BRANCH,
        specialistId: SPECIALIST,
        roomId: null,
        serviceId: SERVICE,
        durationMinutes: 60,
        bufferAfterMinutes: 0,
        branchTimezone: 'Europe/Moscow',
        dateFrom: '2026-08-19',
        dateTo: '2026-08-19',
        slotCount: 1,
      });
      return { branches, services, context, slots };
    });

    expect(result.branches).toHaveLength(1);
    expect(result.services.map((service) => service.id)).toEqual([SERVICE]);
    expect(result.context?.specialistId).toBe(SPECIALIST);
    expect(result.slots.flatMap((day) => day.slots).length).toBeGreaterThan(0);
    expect(fakes.getDrizzle).not.toHaveBeenCalled();
  });

  it('leaves an unpublished clinic empty instead of reading it as an ordinary one', async () => {
    fakes.runWebappNamedRoot.mockImplementation(
      doorsAnswering({
        'app.read_public_booking_catalog(uuid,uuid)': null,
        'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)': null,
        'app.list_public_booking_form_fields()': null,
        'app.resolve_public_booking_organization(uuid,uuid)': null,
      }),
    );

    await underPublicPrincipal(async () => {
      await expect(engine.listBranches(ORG)).resolves.toEqual([]);
      await expect(engine.getBranch(BRANCH)).resolves.toBeNull();
      await expect(engine.getService(SERVICE)).resolves.toBeNull();
      await expect(
        engine.listPublicBookableServicesForBranch({ organizationId: ORG, branchId: BRANCH }),
      ).resolves.toEqual([]);
      await expect(
        scheduling.resolveCanonicalInPersonContext({
          organizationId: ORG,
          branchId: BRANCH,
          serviceId: SERVICE,
        }),
      ).resolves.toBeNull();
      await expect(form.listActiveFields(ORG, 'patient')).resolves.toEqual([]);
      await expect(
        scheduling.resolvePublicBookingOrganization({ branchId: BRANCH, serviceId: SERVICE }),
      ).resolves.toBeNull();
      await expect(
        scheduling.getSlots({
          organizationId: ORG,
          branchId: BRANCH,
          specialistId: SPECIALIST,
          roomId: null,
          serviceId: SERVICE,
          durationMinutes: 60,
          bufferAfterMinutes: 0,
          branchTimezone: 'Europe/Moscow',
          dateFrom: '2026-08-19',
          dateTo: '2026-08-19',
          slotCount: 1,
        }),
      ).rejects.toThrow('branch_service_not_found');
    });

    expect(fakes.getDrizzle).not.toHaveBeenCalled();
  });

  it('refuses a branch and a service that belong to another organization', async () => {
    fakes.runWebappNamedRoot.mockImplementation(
      doorsAnswering({
        'app.read_public_booking_catalog(uuid,uuid)': {
          branches: [branchPayload(OTHER_ORG)],
          branch: branchPayload(OTHER_ORG),
          services: [servicePayload(OTHER_ORG)],
          service: servicePayload(OTHER_ORG),
        },
        'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)': {
          ...slotSnapshotPayload(),
          context: { ...slotSnapshotPayload().context, organizationId: OTHER_ORG },
        },
      }),
    );

    await underPublicPrincipal(async () => {
      await expect(engine.listBranches(ORG)).resolves.toEqual([]);
      await expect(
        engine.listPublicBookableServicesForBranch({ organizationId: ORG, branchId: BRANCH }),
      ).resolves.toEqual([]);
      await expect(
        scheduling.resolveCanonicalInPersonContext({
          organizationId: ORG,
          branchId: BRANCH,
          serviceId: SERVICE,
        }),
      ).rejects.toThrow('ambiguous_booking_tenant');
    });
  });

  it('takes both booking settings from the slot snapshot, never from the settings tables', async () => {
    fakes.runWebappNamedRoot.mockImplementation(
      doorsAnswering({
        'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)': slotSnapshotPayload(),
      }),
    );

    const hours = await underPublicPrincipal(async () => {
      await scheduling.resolveCanonicalInPersonContext({
        organizationId: ORG,
        branchId: BRANCH,
        serviceId: SERVICE,
      });
      return {
        max: await scheduling.getMaxConsecutiveSlotHours(ORG),
        min: await scheduling.getMinNoticeHours(ORG),
      };
    }, 'api/booking/public/create:POST');

    expect(hours).toEqual({ max: 4, min: 0 });
    expect(fakes.getServerRuntimeInteger).not.toHaveBeenCalled();
  });

  it('refuses the settings outright when no snapshot was read in this scope', async () => {
    await expect(
      underPublicPrincipal(() => scheduling.getMaxConsecutiveSlotHours(ORG)),
    ).rejects.toThrow('catalog_unavailable');
    expect(fakes.getServerRuntimeInteger).not.toHaveBeenCalled();
  });

  it('leaves every other tenant principal on its existing path', async () => {
    await expect(
      withExplicitOrganizationPrincipal(
        { organizationId: ORG, source: 'api/booking/memberships/catalog:GET' },
        () => engine.listBranches(ORG),
      ),
    ).rejects.toThrow('relational read attempted under the tenant-service class');
    expect(fakes.runWebappNamedRoot).not.toHaveBeenCalled();
  });
});
