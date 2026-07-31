import { describe, expect, it, vi } from 'vitest';

/**
 * Boundary proof for TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a 4a.3: the public booking flow
 * (`/book/service`, step 2 of the per-clinic `/book/{publicSlug}` flow) must keep working when
 * the owning organization has the `cms_pages` mechanic disabled — CMS gates article
 * editing/publishing, not online booking.
 */
const fakes = vi.hoisted(() => ({ buildAppDeps: vi.fn() }));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import PublicBookServicePage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';

function searchParamsFor(params: Record<string, string>) {
  return { searchParams: Promise.resolve(params) };
}

function depsWithCmsPagesDisabled() {
  return {
    clinicDirectory: {
      resolveCanonicalSlug: async (slug: string) => ({
        organizationId,
        canonicalSlug: slug,
        disposition: 'current' as const,
      }),
    },
    bookingEngine: {
      catalog: {
        listBranches: async () => [
          {
            id: 'branch-1',
            title: 'Клиника на Ленина',
            cityCode: 'moscow',
            isActive: true,
            sortOrder: 0,
          },
        ],
      },
      services: {
        listServices: async () => [],
        listSpecialistServiceAvailability: async () => [],
      },
    },
    orgEntitlements: {
      resolveMechanicAccess: async () => ({
        mechanic: 'cms_pages',
        state: 'disabled',
        policySource: 'system',
        warning: null,
      }),
    },
  };
}

describe('GET /book/service — public booking flow stays up with cms_pages disabled', () => {
  it('renders the service-selection step for a clinic that has no CMS entitlement', async () => {
    fakes.buildAppDeps.mockReturnValue(depsWithCmsPagesDisabled());

    await expect(
      PublicBookServicePage(
        searchParamsFor({ cityCode: 'moscow', cityTitle: 'Москва', orgSlug: 'his-clinic' }),
      ),
    ).resolves.toBeTruthy();
  });
});
