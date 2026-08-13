import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceContext: vi.fn(),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: async (_workspace: unknown, callback: () => Promise<unknown>) =>
    callback(),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: async (
    _workspace: unknown,
    _source: string,
    callback: () => Promise<unknown>,
  ) => callback(),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { saveContentPage } from '../actions';
import { applyContentLifecycle } from '../lifecycleActions';
import { saveContentSection } from './actions';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';

const organizationId = '11111111-1111-4111-8111-111111111111';

function formData(): FormData {
  const data = new FormData();
  data.set('slug', 'articles');
  data.set('title', 'Статьи');
  return data;
}

function pageFormData(): FormData {
  const data = new FormData();
  data.set('section', 'articles');
  data.set('slug', 'article');
  data.set('title', 'Статья');
  return data;
}

describe('saveContentSection entitlement boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDoctorWorkspaceContext).mockResolvedValue({ organizationId } as never);
  });

  it('refuses a read-only CMS save before reading the content-section port', async () => {
    const getBySlug = vi.fn();
    const orgEntitlements: Pick<OrgEntitlementsPort, 'resolveMechanicAccess'> = {
      resolveMechanicAccess: async () => ({
        mechanic: 'cms_pages',
        state: 'read_only',
        policySource: 'system',
        warning: null,
      }),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements,
      contentSections: { getBySlug },
    } as unknown as ReturnType<typeof buildAppDeps>);

    await expect(saveContentSection(null, formData())).resolves.toEqual({
      ok: false,
      error:
        'Невозможно изменить контент: раздел сейчас доступен только для просмотра по тарифу клиники.',
    });
    expect(getBySlug).not.toHaveBeenCalled();
  });

  it('refuses a read-only CMS page save before reading either content port', async () => {
    const getBySlug = vi.fn();
    const listAll = vi.fn();
    const orgEntitlements: Pick<OrgEntitlementsPort, 'resolveMechanicAccess'> = {
      resolveMechanicAccess: async () => ({
        mechanic: 'cms_pages',
        state: 'read_only',
        policySource: 'system',
        warning: null,
      }),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements,
      contentSections: { getBySlug },
      contentPages: { listAll },
    } as unknown as ReturnType<typeof buildAppDeps>);

    await expect(saveContentPage(null, pageFormData())).resolves.toEqual({
      ok: false,
      error:
        'Невозможно изменить контент: раздел сейчас доступен только для просмотра по тарифу клиники.',
    });
    expect(getBySlug).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });

  it('saves a warmup through the warmups mechanic when ordinary CMS is disabled', async () => {
    const data = pageFormData();
    data.set('section', 'warmups');
    data.set('content_mechanic', 'warmups');
    const resolveMechanicAccess = vi.fn(async (_organizationId: string, mechanic: string) => ({
      mechanic,
      state: mechanic === 'warmups' ? ('full_access' as const) : ('disabled' as const),
      policySource: 'system' as const,
      warning: null,
    }));
    const upsert = vi.fn().mockResolvedValue('page-id');
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: { resolveMechanicAccess },
      contentSections: {
        getBySlug: async () => ({ systemParentCode: 'warmups' }),
      },
      contentPages: { listAll: async () => [], upsert },
    } as unknown as ReturnType<typeof buildAppDeps>);

    await expect(saveContentPage(null, data)).resolves.toEqual({ ok: true });
    expect(resolveMechanicAccess).toHaveBeenCalledWith(organizationId, 'warmups');
    expect(resolveMechanicAccess).not.toHaveBeenCalledWith(organizationId, 'cms_pages');
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('publishes a warmup through the warmups mechanic when ordinary CMS is disabled', async () => {
    const resolveMechanicAccess = vi.fn(async (_organizationId: string, mechanic: string) => ({
      mechanic,
      state: mechanic === 'warmups' ? ('full_access' as const) : ('disabled' as const),
      policySource: 'system' as const,
      warning: null,
    }));
    const updateLifecycle = vi.fn().mockResolvedValue(undefined);
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: { resolveMechanicAccess },
      contentPages: {
        getById: vi.fn().mockResolvedValue({
          id: '22222222-2222-4222-8222-222222222222',
          section: 'warmups',
          slug: 'warmup',
        }),
        updateLifecycle,
      },
      contentSections: {
        getBySlug: vi.fn().mockResolvedValue({ systemParentCode: 'warmups' }),
      },
    } as unknown as ReturnType<typeof buildAppDeps>);
    const data = new FormData();
    data.set('id', '22222222-2222-4222-8222-222222222222');
    data.set('op', 'publish');

    await expect(applyContentLifecycle(null, data)).resolves.toEqual({ ok: true });
    expect(resolveMechanicAccess).toHaveBeenCalledWith(organizationId, 'warmups');
    expect(resolveMechanicAccess).not.toHaveBeenCalledWith(organizationId, 'cms_pages');
    expect(updateLifecycle).toHaveBeenCalledOnce();
  });
});
