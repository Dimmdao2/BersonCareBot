import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  getOptionalPatientSession: vi.fn(),
  canViewPatientAuthOnlySection: vi.fn(),
  filterPatientSectionPages: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirect: vi.fn((target: string) => {
    throw new Error(`PERMANENT_REDIRECT:${target}`);
  }),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  getOptionalPatientSession: fakes.getOptionalPatientSession,
}));
vi.mock('@/app-layer/platform-access', () => ({
  canViewPatientAuthOnlySection: fakes.canViewPatientAuthOnlySection,
  filterPatientSectionPages: fakes.filterPatientSectionPages,
}));
vi.mock('@/shared/ui/patient/PatientAppShell', () => ({
  PatientAppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('./PatientSectionPageBody', () => ({
  PatientSectionPageBody: () => <div>CMS section</div>,
}));

import PatientSectionPage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';

describe('GET /app/patient/sections/[slug] — cms_pages mechanic gate', () => {
  it('acts like a hidden CMS section when its owning clinic disabled cms_pages', async () => {
    fakes.getOptionalPatientSession.mockResolvedValue(null);
    fakes.canViewPatientAuthOnlySection.mockResolvedValue(true);
    fakes.filterPatientSectionPages.mockResolvedValue([]);
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({
          mechanic: 'cms_pages',
          state: 'disabled',
          policySource: 'system',
          warning: null,
        }),
      },
      contentSections: {
        getBySlug: async () => ({
          slug: 'articles',
          title: 'Статьи',
          isVisible: true,
          requiresAuth: false,
          systemParentCode: null,
          organizationId,
        }),
        getRedirectNewSlugForOldSlug: async () => null,
      },
      contentPages: { listBySection: async () => [] },
      patientHomeBlocks: { listBlocksWithItems: async () => [] },
      entitlements: {},
    });

    await expect(PatientSectionPage({ params: Promise.resolve({ slug: 'articles' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
