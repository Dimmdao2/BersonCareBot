import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));

import { GET } from './route';

const presentation = {
  version: 1,
  revision: 0,
  layout: 'neutral' as const,
  signature: '',
  contacts: '',
  logoAssetId: null,
  avatarAssetId: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'admin-1' } },
  });
  fakes.buildAppDeps.mockReturnValue({
    notifTemplates: {
      getManagedTemplates: vi.fn().mockResolvedValue([]),
      getManagedPresentation: vi.fn().mockResolvedValue(presentation),
    },
  });
});

describe('GET /api/admin/notification-templates', () => {
  // Поломка: без brandingMutationAvailable:true редактор platform defaults
  // либо не грузится, либо сохранение молча disabled (как clinic без branding).
  it('marks platform defaults as mutable for the shared template editor', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.brandingMutationAvailable).toBe(true);
    expect(fakes.buildAppDeps().notifTemplates.getManagedTemplates).toHaveBeenCalledWith({
      organizationId: null,
    });
  });
});
