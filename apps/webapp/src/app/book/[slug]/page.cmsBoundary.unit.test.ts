import { describe, expect, it, vi } from 'vitest';

/**
 * Boundary proof for TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a 4a.3: the clinic's public booking entry
 * `/book/{publicSlug}` must keep working when the owning organization has the `cms_pages`
 * mechanic disabled — CMS gates article editing/publishing, not the clinic's public presence.
 */
const fakes = vi.hoisted(() => ({ buildAppDeps: vi.fn() }));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import PublicBookOrganizationPage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';

function paramsFor(slug: string) {
  return { params: Promise.resolve({ slug }) };
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
      catalog: { listBranches: async () => [] },
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

describe('GET /book/[slug] — clinic public booking entry stays up with cms_pages disabled', () => {
  it('renders the public booking page for a clinic that has no CMS entitlement', async () => {
    fakes.buildAppDeps.mockReturnValue(depsWithCmsPagesDisabled());

    await expect(PublicBookOrganizationPage(paramsFor('his-clinic'))).resolves.toBeTruthy();
  });

  it('still 404s uniformly for an unpublished/unknown slug (unrelated to CMS state)', async () => {
    fakes.buildAppDeps.mockReturnValue({
      ...depsWithCmsPagesDisabled(),
      clinicDirectory: { resolveCanonicalSlug: async () => null },
    });

    await expect(PublicBookOrganizationPage(paramsFor('unknown-clinic'))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
