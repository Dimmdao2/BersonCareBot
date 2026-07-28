import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const loadInPersonServicesForCityRscMock = vi.hoisted(() => vi.fn());
const resolvePublicOrganizationBySlugRscMock = vi.hoisted(() => vi.fn());
const loadPublicOrganizationServicesForCityRscMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error('NEXT_REDIRECT');
  },
  notFound: () => {
    notFoundMock();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/app/app/patient/booking/bookingCatalogRsc', () => ({
  loadInPersonServicesForCityRsc: loadInPersonServicesForCityRscMock,
}));

vi.mock('../publicOrganizationBooking', () => ({
  resolvePublicOrganizationBySlugRsc: resolvePublicOrganizationBySlugRscMock,
  loadPublicOrganizationServicesForCityRsc: loadPublicOrganizationServicesForCityRscMock,
}));

import PublicBookServicePage from './page';

const ORGANIZATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('PublicBookServicePage (/book/service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('without orgSlug: keeps the exact generic anonymous fail-closed behavior unchanged', async () => {
    loadInPersonServicesForCityRscMock.mockResolvedValue({
      ok: false,
      error: 'catalog_unavailable',
      services: [],
    });

    const element = await PublicBookServicePage({
      searchParams: Promise.resolve({ cityCode: 'moscow', cityTitle: 'Москва' }),
    });

    expect(loadInPersonServicesForCityRscMock).toHaveBeenCalledWith('moscow');
    expect(resolvePublicOrganizationBySlugRscMock).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });

  it('with orgSlug: resolves the organization and loads the org-scoped catalog', async () => {
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue({ organizationId: ORGANIZATION_A });
    loadPublicOrganizationServicesForCityRscMock.mockResolvedValue({
      ok: true,
      branchId: 'branch-a',
      branchTitle: 'Клиника A',
      cityCode: 'moscow',
      services: [],
    });

    await PublicBookServicePage({
      searchParams: Promise.resolve({
        cityCode: 'moscow',
        cityTitle: 'Москва',
        orgSlug: 'saas-test-clinic-a',
      }),
    });

    expect(resolvePublicOrganizationBySlugRscMock).toHaveBeenCalledWith('saas-test-clinic-a');
    expect(loadPublicOrganizationServicesForCityRscMock).toHaveBeenCalledWith(
      ORGANIZATION_A,
      'moscow',
    );
    expect(loadInPersonServicesForCityRscMock).not.toHaveBeenCalled();
  });

  it('with an unknown orgSlug: fails closed with a uniform 404, never falls back to the anonymous catalog', async () => {
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue(null);

    await expect(
      PublicBookServicePage({
        searchParams: Promise.resolve({ cityCode: 'moscow', orgSlug: 'no-such-clinic' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(loadInPersonServicesForCityRscMock).not.toHaveBeenCalled();
    expect(loadPublicOrganizationServicesForCityRscMock).not.toHaveBeenCalled();
  });

  it('redirects back to the slug-scoped format step (not the generic one) when the city is unknown for that org', async () => {
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue({ organizationId: ORGANIZATION_A });
    loadPublicOrganizationServicesForCityRscMock.mockResolvedValue({
      ok: false,
      error: 'city_not_found',
      services: [],
    });

    await expect(
      PublicBookServicePage({
        searchParams: Promise.resolve({ cityCode: 'unknown-city', orgSlug: 'saas-test-clinic-a' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/book/saas-test-clinic-a');
  });
});
