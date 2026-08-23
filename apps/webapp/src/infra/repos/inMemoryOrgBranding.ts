/**
 * In-memory organization-branding port (Vitest / no-DB runs). It mirrors the guarantees migration
 * 0238 enforces in PostgreSQL: one draft and one published revision per organization, publication
 * only as a transition, archived history retained, and a logo that must be owned by the SAME
 * organization (the DB trigger `app.guard_org_brand_revision()` is the authoritative chokepoint).
 */
import { randomUUID } from 'node:crypto';
import type {
  CoreOrganizationContext,
  OrgBrandRevision,
  OrgBrandRevisionStatus,
  OrgBrandingPort,
  SaveOrgBrandDraftInput,
} from '@/modules/org-branding/ports';

type SeedOrganization = { organizationId: string; displayName: string; isActive?: boolean };
type SeedMedia = {
  mediaId: string;
  /** `null` models a platform-owned asset, which a paid organization brand may never use. */
  organizationId: string | null;
  ready?: boolean;
  image?: boolean;
};

const organizations = new Map<string, CoreOrganizationContext>();
const media = new Map<string, { organizationId: string | null; ready: boolean; image: boolean }>();
let revisions: OrgBrandRevision[] = [];

export function resetInMemoryOrgBrandingForTests(): void {
  organizations.clear();
  media.clear();
  revisions = [];
}

export function seedInMemoryOrgBrandingOrganization(input: SeedOrganization): void {
  organizations.set(input.organizationId, {
    organizationId: input.organizationId,
    displayName: input.displayName,
    isActive: input.isActive ?? true,
  });
}

export function seedInMemoryOrgBrandingMedia(input: SeedMedia): void {
  media.set(input.mediaId, {
    organizationId: input.organizationId,
    ready: input.ready ?? true,
    image: input.image ?? true,
  });
}

/**
 * Mirrors what PostgreSQL does when the media purge deletes a referenced asset:
 * `logo_media_id … ON DELETE SET NULL` clears the reference on EVERY revision — including published
 * and archived ones — and deletes nothing else (migration 0238; the trigger's FK tolerance was added
 * after the independent audit proved the delete previously failed with SQLSTATE P0001).
 */
export function purgeInMemoryOrgBrandingMedia(mediaId: string): void {
  media.delete(mediaId);
  for (const revision of revisions) {
    if (revision.logoMediaId === mediaId) {
      revision.logoMediaId = null;
      revision.logoMediaReady = false;
    }
  }
}

/** Read-only view for assertions about the retained audit trail. */
export function listInMemoryOrgBrandRevisions(organizationId: string): OrgBrandRevision[] {
  return revisions
    .filter((revision) => revision.organizationId === organizationId)
    .map((revision) => ({ ...revision, logoMediaReady: logoReady(revision) }));
}

function logoReady(revision: Pick<OrgBrandRevision, 'logoMediaId' | 'organizationId'>): boolean {
  if (!revision.logoMediaId) return false;
  const asset = media.get(revision.logoMediaId);
  if (!asset) return false;
  return (
    asset.organizationId !== null &&
    asset.organizationId === revision.organizationId &&
    asset.ready &&
    asset.image
  );
}

function find(organizationId: string, status: OrgBrandRevisionStatus): OrgBrandRevision | null {
  const found = revisions.find(
    (revision) => revision.organizationId === organizationId && revision.status === status,
  );
  return found ? { ...found, logoMediaReady: logoReady(found) } : null;
}

function assertLogoOwnedByOrganization(input: {
  organizationId: string;
  logoMediaId: string | null;
}): void {
  if (!input.logoMediaId) return;
  const asset = media.get(input.logoMediaId);
  if (!asset || asset.organizationId === null || asset.organizationId !== input.organizationId) {
    throw new Error('org_brand_logo_media_must_be_owned_by_organization');
  }
}

export function createInMemoryOrgBrandingPort(): OrgBrandingPort {
  return {
    async getCoreContext(organizationId: string): Promise<CoreOrganizationContext | null> {
      return organizations.get(organizationId) ?? null;
    },

    async getPublishedRevision(organizationId: string): Promise<OrgBrandRevision | null> {
      return find(organizationId, 'published');
    },

    async getDraftRevision(organizationId: string): Promise<OrgBrandRevision | null> {
      return find(organizationId, 'draft');
    },

    async saveDraft(input: SaveOrgBrandDraftInput): Promise<OrgBrandRevision> {
      assertLogoOwnedByOrganization(input);
      const now = new Date().toISOString();
      const existing = revisions.find(
        (revision) =>
          revision.organizationId === input.organizationId && revision.status === 'draft',
      );
      if (existing) {
        existing.displayName = input.displayName;
        existing.patientAppName = input.patientAppName;
        existing.accentToken = input.accentToken;
        existing.logoMediaId = input.logoMediaId;
        existing.updatedAt = now;
        return { ...existing, logoMediaReady: logoReady(existing) };
      }
      const draft: OrgBrandRevision = {
        id: randomUUID(),
        organizationId: input.organizationId,
        status: 'draft',
        displayName: input.displayName,
        patientAppName: input.patientAppName,
        accentToken: input.accentToken,
        logoMediaId: input.logoMediaId,
        logoMediaReady: false,
        createdByPlatformUserId: input.actorPlatformUserId,
        publishedByPlatformUserId: null,
        archivedByPlatformUserId: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      revisions.push(draft);
      return { ...draft, logoMediaReady: logoReady(draft) };
    },

    async publishDraft(input: {
      organizationId: string;
      actorPlatformUserId: string;
    }): Promise<OrgBrandRevision | null> {
      const draft = revisions.find(
        (revision) =>
          revision.organizationId === input.organizationId && revision.status === 'draft',
      );
      if (!draft) return null;
      const now = new Date().toISOString();
      for (const revision of revisions) {
        if (revision.organizationId === input.organizationId && revision.status === 'published') {
          revision.status = 'archived';
          revision.archivedAt = now;
          revision.archivedByPlatformUserId = input.actorPlatformUserId;
          revision.updatedAt = now;
        }
      }
      draft.status = 'published';
      draft.publishedAt = now;
      draft.publishedByPlatformUserId = input.actorPlatformUserId;
      draft.updatedAt = now;
      return { ...draft, logoMediaReady: logoReady(draft) };
    },

    async unpublish(input: {
      organizationId: string;
      actorPlatformUserId: string;
    }): Promise<boolean> {
      const published = revisions.find(
        (revision) =>
          revision.organizationId === input.organizationId && revision.status === 'published',
      );
      if (!published) return false;
      const now = new Date().toISOString();
      published.status = 'archived';
      published.archivedAt = now;
      published.archivedByPlatformUserId = input.actorPlatformUserId;
      published.updatedAt = now;
      return true;
    },
  };
}
