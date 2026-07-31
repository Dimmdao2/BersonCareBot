import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getOptionalPatientSession: vi.fn(),
  patientRscPersonalDataGate: vi.fn(),
  buildAppDeps: vi.fn(),
  resolvePatientCanViewContent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  getOptionalPatientSession: fakes.getOptionalPatientSession,
  patientRscPersonalDataGate: fakes.patientRscPersonalDataGate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/platform-access', () => ({
  resolvePatientCanViewContent: fakes.resolvePatientCanViewContent,
}));
vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://app.example.com' } }));
vi.mock('./PatientContentSlugArticle', () => ({
  PatientContentSlugArticle: () => null,
}));

import ContentSlugPage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';

function paramsFor(slug: string) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) };
}

function baseDeps(resolveMechanicAccessState: 'disabled' | 'grace') {
  return {
    patientOrganization: {},
    contentPages: {
      getBySlug: async () => ({
        id: 'page-1',
        organizationId,
        section: 'articles',
        slug: 'his-article',
        title: 'Статья',
        requiresAuth: false,
      }),
    },
    contentCatalog: { getBySlug: async () => ({ slug: 'his-article' }) },
    patientHomeBlocks: { listBlocksWithItems: async () => [] },
    contentSections: {},
    systemSettings: {},
    orgEntitlements: {
      resolveMechanicAccess: async () => ({
        mechanic: 'cms_pages',
        state: resolveMechanicAccessState,
        policySource: 'system',
        warning: null,
      }),
    },
  };
}

describe('GET /app/patient/content/[slug] — cms_pages mechanic gate', () => {
  it('acts like a hidden section when the owning clinic disabled cms_pages', async () => {
    fakes.getOptionalPatientSession.mockResolvedValue(null);
    fakes.buildAppDeps.mockReturnValue(baseDeps('disabled'));

    await expect(ContentSlugPage(paramsFor('his-article'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders the article when the owning clinic has cms_pages included', async () => {
    fakes.getOptionalPatientSession.mockResolvedValue(null);
    fakes.buildAppDeps.mockReturnValue(baseDeps('grace'));

    await expect(ContentSlugPage(paramsFor('his-article'))).resolves.toBeTruthy();
  });
});
