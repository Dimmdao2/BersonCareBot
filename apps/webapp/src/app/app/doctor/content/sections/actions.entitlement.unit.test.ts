import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceContext: vi.fn(),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { saveContentPage } from '../actions';
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
      error: 'commercial_read_only',
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
      error: 'commercial_read_only',
    });
    expect(getBySlug).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });
});
