import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
  saveManagedTemplate: vi.fn(),
  saveManagedPresentation: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));

import { MechanicWriteClearanceRequiredError } from '@/app-layer/entitlements/mechanicWriteClearance';
import { GET, PUT } from './route';

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
      saveManagedTemplate: fakes.saveManagedTemplate,
      saveManagedPresentation: fakes.saveManagedPresentation,
    },
  });
  fakes.saveManagedTemplate.mockResolvedValue({ event: 'created', audience: 'patient' });
  fakes.saveManagedPresentation.mockResolvedValue(presentation);
});

function put(body: unknown): Request {
  return new Request('https://example.test/api/admin/notification-templates', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const channels = {
  email: { subject: 'Тема', plainText: 'Текст' },
  telegram: { text: 'Текст' },
  max: { text: 'Текст' },
  smsc: { text: 'Текст' },
  web_push: { title: 'Тема', text: 'Текст' },
};

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

  it('saves platform defaults through the explicit platform-owned write target', async () => {
    const response = await PUT(
      put({
        kind: 'template',
        event: 'created',
        audience: 'patient',
        channels,
        expectedUpdatedAt: null,
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.saveManagedTemplate).toHaveBeenCalledWith(
      'created',
      'patient',
      channels,
      'admin-1',
      null,
      { owner: 'platform' },
    );
  });

  it('turns an injected clinic-mechanic refusal into an explained 403, never a 500', async () => {
    fakes.saveManagedPresentation.mockRejectedValue(
      new MechanicWriteClearanceRequiredError('branding'),
    );

    const response = await PUT(
      put({
        kind: 'presentation',
        presentation: { layout: 'neutral', signature: '', contacts: '' },
        expectedUpdatedAt: null,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'mechanic_write_clearance_required',
      mechanic: 'branding',
      message:
        'Сохранение платформенного шаблона недоступно: запрос попал в тарифную дверь клиники.',
    });
  });
});
