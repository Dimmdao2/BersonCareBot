import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createOrgBrandingService } from './service';
import type { OrgBrandingPort } from './ports';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorPlatformUserId = '22222222-2222-4222-8222-222222222222';

function buildService() {
  const saveDraft = vi.fn(async () => ({
    id: 'draft-1',
    organizationId,
    status: 'draft' as const,
    displayName: 'Клиника',
    logoMediaId: null,
    logoMediaReady: false,
    createdByPlatformUserId: actorPlatformUserId,
    publishedByPlatformUserId: null,
    archivedByPlatformUserId: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }));
  const port: OrgBrandingPort = {
    getCoreContext: vi.fn(async () => ({
      organizationId,
      displayName: 'Клиника',
      isActive: true,
    })),
    getPublishedRevision: vi.fn(async () => null),
    getDraftRevision: vi.fn(async () => null),
    saveDraft,
    publishDraft: vi.fn(async () => null),
    unpublish: vi.fn(async () => true),
  };
  const service = createOrgBrandingService({
    port,
    assertWriteClearance: assertMechanicWriteClearance,
    resolveBrandingAccess: async () => ({
      mechanic: 'branding',
      state: 'full_access',
      policySource: 'mechanic',
      warning: null,
    }),
  });
  return { service, saveDraft };
}

const ctx = {
  organizationId,
  actorPlatformUserId,
  hasOrganizationManagementCapability: true as const,
};

describe('org-branding service — 3.2 physical door (branding)', () => {
  it('refuses saveDraft when no branding mutation decision ran first', async () => {
    const { service, saveDraft } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.saveDraft(ctx, { displayName: 'Клиника', logoMediaId: null }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared branding for this continuation', async () => {
    const { service, saveDraft } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('branding');
      const result = await service.saveDraft(ctx, { displayName: 'Клиника', logoMediaId: null });
      expect(result.ok).toBe(true);
    });
    expect(saveDraft).toHaveBeenCalledOnce();
  });
});
