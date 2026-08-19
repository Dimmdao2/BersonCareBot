import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Что сломается без этого теста: публичная страница клиники `/book/{slug}` снова сможет
 * отрисовать «Каталог недоступен» на НЕВЫПОЛНИВШЕМСЯ чтении каталога, не оставив об этом ни
 * одной записи. Замер 19.08 на TEST: обе опубликованные клиники отдавали этот экран, при том
 * что каталог у них заполнен, — и ни в журнале вебаппа, ни в логе Postgres не было ничего
 * (чтение отвергается до отправки statement'а, поэтому Postgres его и не видит).
 *
 * Oracle — правило репозитория, по которому уже сделаны правки переписи
 * `docs/_TODO/SWALLOWED_ERRORS_CENSUS_2026-08-19.md`: отказ инфраструктуры не отрисовывается
 * как отсутствие данных, а становится диагностируемой строкой уровня error.
 *
 * Тест держит ОБЕ стороны различия: отказ виден, законная пустота — нет.
 */
const fakes = vi.hoisted(() => ({ buildAppDeps: vi.fn() }));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import {
  loadPublicOrganizationCitiesRsc,
  loadPublicOrganizationServicesForCityRsc,
} from './publicOrganizationBooking';

const organizationId = '53000000-0000-4000-8000-0000000000a1';

function depsWithBranches(listBranches: () => Promise<unknown[]>) {
  return {
    bookingEngine: {
      catalog: {
        listBranches,
        getBranch: async () => null,
        listSpecialists: async () => [],
      },
      services: {
        listServices: async () => [],
        listSpecialistServiceAvailability: async () => [],
      },
    },
  };
}

let errorLines: unknown[][];

beforeEach(() => {
  errorLines = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errorLines.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('public booking catalog — a read that could not run is reported, an empty clinic is not', () => {
  it('reports the refused catalog read with the organization and the actual reason', async () => {
    const refused = Object.assign(new Error('permission denied for table be_branches'), {
      code: '42501',
    });
    fakes.buildAppDeps.mockReturnValue(
      depsWithBranches(async () => {
        throw refused;
      }),
    );

    const result = await loadPublicOrganizationCitiesRsc(organizationId);

    expect(result.ok).toBe(false);
    expect(errorLines).toHaveLength(1);
    const [, details] = errorLines[0] as [string, Record<string, unknown>];
    expect(details).toMatchObject({
      category: 'capability_denied',
      code: '42501',
      message: 'permission denied for table be_branches',
      organizationId,
      source: 'app/book/[slug]:load-cities',
    });
  });

  it('reports a catalog read that never reached the database at all', async () => {
    fakes.buildAppDeps.mockReturnValue(
      depsWithBranches(async () => {
        throw new Error('Missing declared webapp port capability: tenant_service');
      }),
    );

    const result = await loadPublicOrganizationCitiesRsc(organizationId);

    expect(result.ok).toBe(false);
    expect(errorLines).toHaveLength(1);
    const [, details] = errorLines[0] as [string, Record<string, unknown>];
    expect(details).toMatchObject({
      category: 'repository_unavailable',
      message: 'Missing declared webapp port capability: tenant_service',
      organizationId,
    });
  });

  it('names the underlying reason when the driver wrapped it in a query error', async () => {
    // Reproduction, dev 19.08: the read is refused before any statement is sent, and drizzle
    // hands the loader `Failed query: select ... from "be_branches"` with the actual reason on
    // `cause`. A line that repeats only the statement is the same silence one level down.
    const wrapped = new Error('Failed query: select ... from "be_branches"', {
      cause: Object.assign(new Error('permission denied for table be_branches'), { code: '42501' }),
    });
    fakes.buildAppDeps.mockReturnValue(
      depsWithBranches(async () => {
        throw wrapped;
      }),
    );

    const result = await loadPublicOrganizationCitiesRsc(organizationId);

    expect(result.ok).toBe(false);
    const [, details] = errorLines[0] as [string, Record<string, unknown>];
    expect(details).toMatchObject({
      category: 'capability_denied',
      code: '42501',
      cause: 'permission denied for table be_branches',
    });
  });

  it('stays silent when the clinic simply published no branches', async () => {
    fakes.buildAppDeps.mockReturnValue(depsWithBranches(async () => []));

    const result = await loadPublicOrganizationCitiesRsc(organizationId);

    expect(result).toMatchObject({ ok: true, cities: [], onlineLocation: null });
    expect(errorLines).toHaveLength(0);
  });

  it('reports a refused service read for a city, and stays silent on an unknown city', async () => {
    const refused = Object.assign(new Error('permission denied for table be_branches'), {
      code: '42501',
    });
    fakes.buildAppDeps.mockReturnValue(
      depsWithBranches(async () => {
        throw refused;
      }),
    );
    const failed = await loadPublicOrganizationServicesForCityRsc(organizationId, 'test-a');
    expect(failed).toMatchObject({ ok: false, error: 'catalog_unavailable' });
    expect(errorLines).toHaveLength(1);

    errorLines = [];
    fakes.buildAppDeps.mockReturnValue(depsWithBranches(async () => []));
    const missing = await loadPublicOrganizationServicesForCityRsc(organizationId, 'test-a');
    expect(missing).toMatchObject({ ok: false, error: 'city_not_found' });
    expect(errorLines).toHaveLength(0);
  });
});
