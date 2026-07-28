import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultManagedNotifTemplate } from '@/modules/notif-templates/managedNotifTemplate';

const {
  managementGuardMock,
  readEntitlementMock,
  mutationEntitlementMock,
  getManagedTemplatesMock,
  getPresentationMock,
  saveTemplateMock,
} = vi.hoisted(() => ({
  managementGuardMock: vi.fn(),
  readEntitlementMock: vi.fn(),
  mutationEntitlementMock: vi.fn(),
  getManagedTemplatesMock: vi.fn(),
  getPresentationMock: vi.fn(),
  saveTemplateMock: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: managementGuardMock,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: readEntitlementMock,
  requireEntitlementForMutation: mutationEntitlementMock,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    notifTemplates: {
      getManagedTemplates: getManagedTemplatesMock,
      getManagedPresentation: getPresentationMock,
      saveManagedTemplate: saveTemplateMock,
      saveManagedPresentation: vi.fn(),
    },
  }),
}));

import { GET, PUT } from './route';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MANAGEMENT = {
  ok: true as const,
  ctx: { organizationId: ORG_A, session: { user: { userId: 'owner-a' } } },
};
const DENIED = {
  ok: false as const,
  response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
};

function putRequest(body: unknown) {
  return new Request('http://localhost/api/doctor/notification-templates', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('organization notification templates API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managementGuardMock.mockResolvedValue(MANAGEMENT);
    readEntitlementMock.mockResolvedValue({ ok: true });
    mutationEntitlementMock.mockResolvedValue({ ok: true });
    getManagedTemplatesMock.mockResolvedValue([]);
    getPresentationMock.mockResolvedValue({ presentation: {}, metadata: {} });
  });

  it('denies a specialist without organization-management capability', async () => {
    managementGuardMock.mockResolvedValue(DENIED);
    expect((await GET()).status).toBe(403);
    expect(readEntitlementMock).not.toHaveBeenCalled();
  });

  it('denies an organization without the branding entitlement', async () => {
    readEntitlementMock.mockResolvedValue(DENIED);
    expect((await GET()).status).toBe(403);
    expect(getManagedTemplatesMock).not.toHaveBeenCalled();
  });

  it('reads templates only for the server-resolved organization', async () => {
    expect((await GET()).status).toBe(200);
    expect(readEntitlementMock).toHaveBeenCalledWith(MANAGEMENT.ctx, 'branding');
    expect(getManagedTemplatesMock).toHaveBeenCalledWith({ organizationId: ORG_A });
  });

  it('denies template mutation when the commercial lifecycle is read-only', async () => {
    mutationEntitlementMock.mockResolvedValue(DENIED);
    const channels = createDefaultManagedNotifTemplate('rescheduled', 'doctor').channels;

    const response = await PUT(
      putRequest({
        kind: 'template',
        event: 'rescheduled',
        audience: 'doctor',
        channels,
        expectedUpdatedAt: null,
      }),
    );

    expect(response.status).toBe(403);
    expect(mutationEntitlementMock).toHaveBeenCalledWith(MANAGEMENT.ctx, 'branding');
    expect(saveTemplateMock).not.toHaveBeenCalled();
  });

  it('cannot select another organization in the request body', async () => {
    const channels = createDefaultManagedNotifTemplate('rescheduled', 'doctor').channels;
    saveTemplateMock.mockResolvedValue({ event: 'rescheduled' });
    const response = await PUT(
      putRequest({
        kind: 'template',
        event: 'rescheduled',
        audience: 'doctor',
        channels,
        expectedUpdatedAt: null,
        organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    );
    expect(response.status).toBe(400);
    expect(saveTemplateMock).not.toHaveBeenCalled();
  });

  it('writes only to the server-resolved organization', async () => {
    const channels = createDefaultManagedNotifTemplate('rescheduled', 'doctor').channels;
    saveTemplateMock.mockResolvedValue({ event: 'rescheduled' });
    const response = await PUT(
      putRequest({
        kind: 'template',
        event: 'rescheduled',
        audience: 'doctor',
        channels,
        expectedUpdatedAt: null,
      }),
    );
    expect(response.status).toBe(200);
    expect(saveTemplateMock).toHaveBeenCalledWith(
      'rescheduled',
      'doctor',
      channels,
      'owner-a',
      null,
      { organizationId: ORG_A },
    );
  });
});
