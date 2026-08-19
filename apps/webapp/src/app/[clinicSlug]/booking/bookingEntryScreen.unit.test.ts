/**
 * Первый экран записи как функция параметров ссылки, и три протухших параметра (план §6.2, §6.3).
 *
 * Живой дефект, который здесь закрывается: экрана выбора филиала НЕ БЫЛО как кода. Первый шаг
 * предлагал города, филиал выводился сервером как ПЕРВЫЙ активный по `sort_order`, и второй филиал
 * того же города был недостижим вовсе, а запись привязывалась к филиалу, которого человек не
 * выбирал. Утверждение «второй филиал того же города достижим» — ровно об этом.
 */
import { describe, expect, it, vi } from 'vitest';

const ORG = '44444444-4444-4444-8444-444444444444';
const OTHER_ORG = '55555555-5555-4555-8555-555555555555';
const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN_BRANCH = '33333333-3333-4333-8333-333333333333';
const SPECIALIST = '66666666-6666-4666-8666-666666666666';
const GONE_SPECIALIST = '77777777-7777-4777-8777-777777777777';
const SERVICE = '88888888-8888-4888-8888-888888888888';

const deps = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: () => deps.value }));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

const { loadBookingEntryScreenRsc } = await import('./loadBookingEntry');

/** Обе клиники в одном городе, у первой — ДВА филиала. */
function catalog() {
  const branches = [
    {
      id: BRANCH_A,
      organizationId: ORG,
      title: 'На Ленина',
      cityCode: 'moscow',
      isActive: true,
      sortOrder: 0,
    },
    {
      id: BRANCH_B,
      organizationId: ORG,
      title: 'На Мира',
      cityCode: 'moscow',
      isActive: true,
      sortOrder: 1,
    },
    {
      id: FOREIGN_BRANCH,
      organizationId: OTHER_ORG,
      title: 'Чужой филиал',
      cityCode: 'moscow',
      isActive: true,
      sortOrder: 0,
    },
  ];
  return {
    bookingEngine: {
      catalog: {
        listBranches: async (organizationId: string) =>
          branches.filter((branch) => branch.organizationId === organizationId),
        getBranch: async (id: string) => branches.find((branch) => branch.id === id) ?? null,
        listSpecialists: async (organizationId: string) =>
          organizationId === ORG
            ? [
                {
                  id: SPECIALIST,
                  organizationId: ORG,
                  fullName: 'Иванова А.',
                  isActive: true,
                  sortOrder: 0,
                },
                {
                  id: GONE_SPECIALIST,
                  organizationId: ORG,
                  fullName: 'Ушедший',
                  isActive: false,
                  sortOrder: 1,
                },
              ]
            : [],
      },
      services: {
        listServices: async (organizationId: string) =>
          organizationId === ORG
            ? [
                {
                  id: SERVICE,
                  organizationId: ORG,
                  title: 'Приём',
                  description: null,
                  durationMinutes: 30,
                  priceMinor: 100,
                  isActive: true,
                  publicWidgetVisible: true,
                  adminManualOnly: false,
                },
              ]
            : [],
        listSpecialistServiceAvailability: async (organizationId: string) =>
          organizationId === ORG
            ? [
                {
                  id: 'a1',
                  organizationId: ORG,
                  specialistId: SPECIALIST,
                  serviceId: SERVICE,
                  branchId: BRANCH_A,
                  isActive: true,
                },
                {
                  id: 'a2',
                  organizationId: ORG,
                  specialistId: SPECIALIST,
                  serviceId: SERVICE,
                  branchId: BRANCH_B,
                  isActive: true,
                },
              ]
            : [],
      },
    },
  } as unknown as Record<string, unknown>;
}

describe('первый экран записи клиники', () => {
  it('без параметров показывает ФИЛИАЛЫ, и второй филиал того же города достижим', async () => {
    deps.value = catalog();
    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: null,
      specialistId: null,
    });
    expect(screen.kind).toBe('branches');
    if (screen.kind !== 'branches') return;
    expect(screen.branches.map((branch) => branch.id)).toEqual([BRANCH_A, BRANCH_B]);
  });

  it('филиал в ссылке даёт услуги именно этого филиала', async () => {
    deps.value = catalog();
    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: BRANCH_B,
      specialistId: null,
    });
    expect(screen.kind).toBe('services');
    if (screen.kind !== 'services') return;
    expect(screen.branch.id).toBe(BRANCH_B);
    expect(screen.services.map((service) => service.id)).toEqual([SERVICE]);
  });

  it('филиал ЧУЖОЙ клиники не показывает ничего чужого — это экран «филиал не принимает»', async () => {
    deps.value = catalog();
    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: FOREIGN_BRANCH,
      specialistId: null,
    });
    expect(screen.kind).toBe('stale');
    if (screen.kind !== 'stale') return;
    expect(screen.reason).toBe('branch_gone');
    // И вместо пустого списка — действующие филиалы ЭТОЙ клиники.
    expect(screen.branches.map((branch) => branch.id)).toEqual([BRANCH_A, BRANCH_B]);
  });

  it('ушедший специалист даёт свой экран, а не пустой список услуг', async () => {
    deps.value = catalog();
    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: BRANCH_A,
      specialistId: GONE_SPECIALIST,
    });
    expect(screen.kind).toBe('stale');
    if (screen.kind !== 'stale') return;
    expect(screen.reason).toBe('specialist_gone');
  });

  it('только специалист, без филиала — список филиалов, где он принимает', async () => {
    deps.value = catalog();
    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: null,
      specialistId: SPECIALIST,
    });
    expect(screen.kind).toBe('branches');
    if (screen.kind !== 'branches') return;
    expect(screen.branches.map((branch) => branch.id)).toEqual([BRANCH_A, BRANCH_B]);
  });

  it('нечитаемый каталог — это отказ, а не «филиалов нет»', async () => {
    deps.value = {
      bookingEngine: {
        catalog: {
          listBranches: async () => {
            throw Object.assign(new Error('denied'), { code: '42501' });
          },
          getBranch: async () => null,
          listSpecialists: async () => [],
        },
        services: {
          listServices: async () => [],
          listSpecialistServiceAvailability: async () => [],
        },
      },
    } as unknown as Record<string, unknown>;
    const screen = await loadBookingEntryScreenRsc({
      organizationId: ORG,
      branchId: null,
      specialistId: null,
    });
    expect(screen.kind).toBe('unavailable');
  });
});
