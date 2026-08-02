import { describe, expect, it, vi } from 'vitest';
import { createOrgBrandingService } from './service';
import type { MechanicAccessResolution } from '../org-entitlements/types';
import type { OrgBrandRevision, OrgBrandingPort } from './ports';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorPlatformUserId = '22222222-2222-4222-8222-222222222222';
const logoMediaId = '33333333-3333-4333-8333-333333333333';

const published: OrgBrandRevision = {
  id: '44444444-4444-4444-8444-444444444444',
  organizationId,
  status: 'published',
  displayName: 'Бренд клиники',
  logoMediaId,
  logoMediaReady: true,
  createdByPlatformUserId: actorPlatformUserId,
  publishedByPlatformUserId: actorPlatformUserId,
  archivedByPlatformUserId: null,
  publishedAt: '2026-08-01T00:00:00.000Z',
  archivedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function access(state: MechanicAccessResolution['state']): MechanicAccessResolution {
  return { mechanic: 'branding', state, policySource: 'mechanic', warning: null };
}

function brandingPort(): OrgBrandingPort {
  return {
    getCoreContext: vi.fn(async () => ({
      organizationId,
      displayName: 'Клиника без тарифа',
      isActive: true,
    })),
    getPublishedRevision: vi.fn(async () => published),
    getDraftRevision: vi.fn(async () => null),
    saveDraft: vi.fn(async () => published),
    publishDraft: vi.fn(async () => published),
    unpublish: vi.fn(async () => true),
  };
}

describe('organization branding entitlement ladder', () => {
  it('returns platform presentation to a patient/public consumer while disabled, then restores the retained brand after re-enable', async () => {
    let currentAccess = access('disabled');
    const service = createOrgBrandingService({
      port: brandingPort(),
      resolveBrandingAccess: async () => currentAccess,
    });
    const ctx = {
      organizationId,
      actorPlatformUserId,
      hasOrganizationManagementCapability: true as const,
    };

    await expect(service.getManagementState(ctx)).resolves.toMatchObject({
      brandingVisible: false,
      brandingMutationAvailable: false,
      accessState: 'disabled',
    });

    await expect(service.resolveEffectiveOrgBranding(organizationId)).resolves.toMatchObject({
      core: { displayName: 'Клиника без тарифа' },
      paid: { displayName: null, logoUrl: null },
      effectiveDisplayName: 'Клиника без тарифа',
      resolution: 'entitlement_disabled',
    });

    currentAccess = access('full_access');

    await expect(service.resolveEffectiveOrgBranding(organizationId)).resolves.toMatchObject({
      paid: { displayName: 'Бренд клиники', logoUrl: `/api/media/${logoMediaId}` },
      effectiveDisplayName: 'Бренд клиники',
      resolution: 'applied',
    });
  });

  it('keeps the existing brand visible in read-only and rejects a direct save before the port', async () => {
    const port = brandingPort();
    const service = createOrgBrandingService({
      port,
      resolveBrandingAccess: async () => access('read_only'),
    });
    const ctx = {
      organizationId,
      actorPlatformUserId,
      hasOrganizationManagementCapability: true as const,
    };

    await expect(service.getManagementState(ctx)).resolves.toMatchObject({
      effective: {
        paid: { displayName: 'Бренд клиники', logoUrl: `/api/media/${logoMediaId}` },
        resolution: 'applied',
      },
      brandingVisible: true,
      brandingMutationAvailable: false,
      accessState: 'read_only',
      published,
    });
    await expect(
      service.saveDraft(ctx, { displayName: 'Новый бренд', logoMediaId: null }),
    ).resolves.toEqual({ ok: false, code: 'commercial_read_only' });
    expect(port.saveDraft).not.toHaveBeenCalled();
  });
});
