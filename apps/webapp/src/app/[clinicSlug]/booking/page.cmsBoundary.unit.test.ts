import { describe, expect, it, vi } from 'vitest';

/**
 * Boundary proof for TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a 4a.3: the clinic's public booking entry
 * must keep working when the owning organization has the `cms_pages` mechanic disabled — CMS gates
 * article editing/publishing, not the clinic's public presence.
 *
 * ПЕРЕЕХАЛ 19.08 с `/book/{slug}` вместе с самим входом: владелец развернул адрес в
 * `/{clinic}/booking`, а прежний путь стал вечным 308-редиректом. Требование не изменилось —
 * изменился адрес, на котором его надо доказывать. Оставить тест на редиректе значило бы оставить
 * зелёную запись, которая больше ничего не проверяет.
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
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

import ClinicBookingEntryPage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';

function argsFor(slug: string) {
  return {
    params: Promise.resolve({ clinicSlug: slug }),
    searchParams: Promise.resolve({}),
  };
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
      catalog: { listBranches: async () => [], listSpecialists: async () => [] },
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

describe('GET /{clinic}/booking — вход записи жив при выключенной CMS', () => {
  it('страница записи рисуется у клиники без права на CMS', async () => {
    fakes.buildAppDeps.mockReturnValue(depsWithCmsPagesDisabled());
    await expect(ClinicBookingEntryPage(argsFor('his-clinic'))).resolves.toBeTruthy();
  });

  it('неизвестный/невыпущенный slug по-прежнему даёт одинаковый 404 — CMS тут ни при чём', async () => {
    fakes.buildAppDeps.mockReturnValue({
      ...depsWithCmsPagesDisabled(),
      clinicDirectory: { resolveCanonicalSlug: async () => null },
    });
    await expect(ClinicBookingEntryPage(argsFor('unknown-clinic'))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
