/**
 * Первый экран публичной записи `/{clinic}/booking` — по НАСТОЯЩЕМУ публичному пути.
 *
 * Что сломается без этого теста (два независимых класса, оба случились 19.08 живьём).
 *
 * 1. **Точку входа забыли внести в `PUBLIC_BOOKING_PRINCIPAL_SOURCES`.** Тогда
 *    `isCurrentPublicBookingPrincipal()` ложно, и КАЖДОЕ чтение каталога уходит реляционным
 *    путём. У класса контекста `tenant_service` порта `webapp` сквозной реляционной двери нет и
 *    по решению схемы не будет — в декларации (`deploy/postgres/privileges/declaration.ts`) у
 *    этого класса объявлены только именованные корни, `purpose: 'relation'` не выдан. Реляционное
 *    чтение отвергается ДО отправки statement'а, и опубликованная клиника показывает анониму
 *    «Каталог временно недоступен» вместо своих филиалов. Отказ дорогой (снаружи нельзя записаться
 *    ни в одну клинику, а старая ссылка из письма подтверждения ведёт 308-редиректом ровно сюда) и
 *    молчаливый (в Postgres нет ни строчки — statement туда не доехал).
 *
 * 2. **Каталог снова читают КАБИНЕТНЫМ листером.** `listInPersonServicesForBranch` тянет
 *    `listServices` / `listSpecialistServiceAvailability` / `listSpecialists` — все три
 *    реляционные, публичной ветки у них нет. Тот же отказ, но на шаге услуг: филиалы нарисовались,
 *    а по клику на филиал экран умер.
 *
 * Ровно эта пара и стояла в ветке: источник `app/[clinicSlug]/booking:entry` в списке
 * отсутствовал, а `loadBookingEntry.ts` звал кабинетный листер. Прежняя редакция ЭТОГО файла
 * держала 6/6 зелёных при мёртвом продукте, потому что подменяла `deps` целиком и вместо
 * настоящего `withExplicitOrganizationPrincipal` ставила сквозную заглушку: принципала не
 * существовало, значит и различить публичную дверь от кабинетной было нечем.
 *
 * Поэтому здесь подменена ТОЛЬКО граница базы: `getDrizzle` (любое реляционное чтение = отказ, как
 * в проде) и `runWebappNamedRoot` (дверь отвечает по точной идентичности корня). DI-контейнер
 * отдаёт НАСТОЯЩИЙ `createPgBookingEnginePort()`; принципал, маршрутизация «дверь vs реляция» и
 * сам загрузчик экрана — продуктовые.
 *
 * Oracle: план `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §6.2 (первый экран как
 * функция параметров), §6.3 (три протухших параметра, ни одного пустого списка), §6.4 (чужой
 * идентификатор в ссылке не открывает чужого); контракт двери — миграция
 * `0047_the_public_funnel_had_no_door_of_its_own.sql`; отказ реляционного класса — декларация прав.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappNamedRoot: vi.fn(),
  getDrizzle: vi.fn(() => {
    throw new Error('relational read attempted under the tenant-service class');
  }),
  deps: { value: null as unknown },
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
  getConfigValue: vi.fn(async () => {
    throw new Error('settings read attempted under the tenant-service class');
  }),
  getServerRuntimeInteger: vi.fn(async () => {
    throw new Error('settings read attempted under the tenant-service class');
  }),
}));
/** Подменён только контейнер: то, что он отдаёт, собрано из настоящих продуктовых сборщиков. */
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: () => fakes.deps.value }));

import { createPgBookingEnginePort } from '@/infra/repos/pgBookingEngine';
import { createBookingEngineService } from '@/modules/booking-engine/service';
import { loadBookingEntryScreenRsc } from './loadBookingEntry';

fakes.deps.value = { bookingEngine: createBookingEngineService(createPgBookingEnginePort()) };

const CATALOG_ROOT = 'app.read_public_booking_catalog(uuid,uuid)';

const ORG = '44444444-4444-4444-8444-444444444444';
const OTHER_ORG = '55555555-5555-4555-8555-555555555555';
const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN_BRANCH = '33333333-3333-4333-8333-333333333333';
const SERVICE = '88888888-8888-4888-8888-888888888888';

function branchRow(id: string, title: string, sortOrder: number, organizationId = ORG) {
  return {
    id,
    organizationId,
    title,
    shortTitle: null,
    color: null,
    cityCode: 'moscow',
    address: null,
    timezone: 'Europe/Moscow',
    isActive: true,
    sortOrder,
  };
}

function serviceRow(organizationId = ORG) {
  return {
    id: SERVICE,
    organizationId,
    title: 'Приём',
    description: null,
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    priceMinor: 100_000,
    prepaymentApplicable: false,
    usableInPackages: false,
    onlinePaymentApplicable: false,
    sortOrder: 10,
    isActive: true,
  };
}

/**
 * Дверь публичного каталога, как она отвечает в SQL: организацию аргументом не принимает (берёт из
 * принятого контекста), по `branchId` отдаёт один филиал и его публично записываемые услуги.
 * Неизвестная идентичность корня роняет тест, а не молчит.
 */
function catalogDoor(branches: ReturnType<typeof branchRow>[]) {
  return async (_db: unknown, functionIdentity: string, args: readonly unknown[]) => {
    if (functionIdentity !== CATALOG_ROOT) {
      throw new Error(`unexpected named root: ${functionIdentity}`);
    }
    const branchId = args[0] as string | null;
    const branch = branchId ? (branches.find((item) => item.id === branchId) ?? null) : null;
    return {
      rows: [
        {
          catalog: {
            branches,
            branch,
            services: branch ? [serviceRow(branch.organizationId)] : [],
            service: null,
          },
        },
      ],
    };
  };
}

const ownBranches = () => [branchRow(BRANCH_A, 'На Ленина', 0), branchRow(BRANCH_B, 'На Мира', 1)];

function namedRootsUsed(): string[] {
  return [...new Set(fakes.runWebappNamedRoot.mock.calls.map((call) => call[1] as string))];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('первый экран записи клиники — публичный путь, настоящий принципал', () => {
  it('без параметров показывает ФИЛИАЛЫ, взятые ДВЕРЬЮ, и второй филиал того же города достижим', async () => {
    fakes.runWebappNamedRoot.mockImplementation(catalogDoor(ownBranches()));

    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: null,
      specialistId: null,
    });

    expect(screen.kind).toBe('branches');
    if (screen.kind !== 'branches') return;
    expect(screen.branches.map((branch) => branch.id)).toEqual([BRANCH_A, BRANCH_B]);
    // Обе половины дефекта 19.08 умирают именно здесь: без записи в
    // PUBLIC_BOOKING_PRINCIPAL_SOURCES этот путь уходит в реляцию.
    expect(fakes.getDrizzle).not.toHaveBeenCalled();
    expect(namedRootsUsed()).toEqual([CATALOG_ROOT]);
  });

  it('филиал в ссылке даёт услуги ЭТОГО филиала, и тоже только дверью', async () => {
    fakes.runWebappNamedRoot.mockImplementation(catalogDoor(ownBranches()));

    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: BRANCH_B,
      specialistId: null,
    });

    expect(screen.kind).toBe('services');
    if (screen.kind !== 'services') return;
    expect(screen.branch.id).toBe(BRANCH_B);
    expect(screen.services.map((service) => service.id)).toEqual([SERVICE]);
    // Кабинетный листер здесь читал бы `listServices` реляционно — то есть отказ вместо услуг.
    expect(fakes.getDrizzle).not.toHaveBeenCalled();
    expect(namedRootsUsed()).toEqual([CATALOG_ROOT]);
  });

  it('филиал ЧУЖОЙ клиники не показывает ничего чужого — это экран «филиал не принимает»', async () => {
    fakes.runWebappNamedRoot.mockImplementation(
      catalogDoor([
        ...ownBranches(),
        branchRow(FOREIGN_BRANCH, 'Чужой филиал', 0, OTHER_ORG),
      ]),
    );

    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: FOREIGN_BRANCH,
      specialistId: null,
    });

    expect(screen.kind).toBe('stale');
    if (screen.kind !== 'stale') return;
    expect(screen.reason).toBe('branch_gone');
    // И вместо пустого списка — действующие филиалы ЭТОЙ клиники, без чужого.
    expect(screen.branches.map((branch) => branch.id)).toEqual([BRANCH_A, BRANCH_B]);
  });

  it('нечитаемый каталог — это слышимый отказ, а не «филиалов нет»', async () => {
    fakes.runWebappNamedRoot.mockImplementation(async () => {
      throw Object.assign(new Error('permission denied'), { code: '42501' });
    });

    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: null,
      specialistId: null,
    });

    expect(screen.kind).toBe('unavailable');
  });
});
