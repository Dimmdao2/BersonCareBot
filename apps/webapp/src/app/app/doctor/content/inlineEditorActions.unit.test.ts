import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceContext: fakes.requireDoctorWorkspaceContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { loadContentPageForInlineEdit } from './inlineEditorActions';

const organizationId = '11111111-1111-4111-8111-111111111111';

describe('loadContentPageForInlineEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceContext.mockResolvedValue({ organizationId });
  });

  it('does not load an article for inline editing when CMS is disabled', async () => {
    const getById = vi.fn();
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (_workspace: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }) },
      contentPages: { getById },
    });

    await expect(loadContentPageForInlineEdit('page-1')).resolves.toBeNull();
    expect(getById).not.toHaveBeenCalled();
  });

  it('keeps an article readable for inline editing when CMS is read-only', async () => {
    const page = {
      id: 'page-1', section: 'news', slug: 'article', title: 'Article', summary: 'Summary', bodyMd: '',
      bodyHtml: '', sortOrder: 0, isPublished: true, requiresAuth: false, videoUrl: null, imageUrl: null,
      archivedAt: null, deletedAt: null, linkedCourseId: null,
    };
    const getById = vi.fn().mockResolvedValue(page);
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (_workspace: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
      contentPages: { getById },
    });

    await expect(loadContentPageForInlineEdit('page-1')).resolves.toEqual(page);
    expect(getById).toHaveBeenCalledWith('page-1');
  });
});
