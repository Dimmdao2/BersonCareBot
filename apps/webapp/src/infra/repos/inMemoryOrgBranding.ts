/**
 * In-memory organization-branding port (Vitest / no-DB runs). It mirrors the guarantees migration
 * 0238 enforces in PostgreSQL: one draft and one published revision per organization, publication
 * only as a transition, archived history retained, and brand media (logo and app icon) that must be
 * owned by the SAME organization (the DB trigger `app.guard_org_brand_revision()` is the
 * authoritative chokepoint).
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
 * `logo_media_id`/`app_icon_media_id … ON DELETE SET NULL` clear the reference on EVERY revision —
 * including published and archived ones — and delete nothing else (migration 0238; the trigger's FK
 * tolerance was added after the independent audit proved the delete previously failed with SQLSTATE
 * P0001, and was extended to the app icon with the owner's 2026-09-10 decision).
 */
export function purgeInMemoryOrgBrandingMedia(mediaId: string): void {
  media.delete(mediaId);
  for (const revision of revisions) {
    if (revision.logoMediaId === mediaId) {
      revision.logoMediaId = null;
      revision.logoMediaReady = false;
    }
    if (revision.appIconMediaId === mediaId) {
      revision.appIconMediaId = null;
      revision.appIconMediaReady = false;
    }
  }
}

/** Read-only view for assertions about the retained audit trail. */
export function listInMemoryOrgBrandRevisions(organizationId: string): OrgBrandRevision[] {
  return revisions
    .filter((revision) => revision.organizationId === organizationId)
    .map(withMediaReadiness);
}

/** Один предикат готовности на оба медиа-поля бренда: условия у них дословно одни и те же. */
function mediaReady(organizationId: string, mediaId: string | null): boolean {
  if (!mediaId) return false;
  const asset = media.get(mediaId);
  if (!asset) return false;
  return (
    asset.organizationId !== null &&
    asset.organizationId === organizationId &&
    asset.ready &&
    asset.image
  );
}

function withMediaReadiness(revision: OrgBrandRevision): OrgBrandRevision {
  return {
    ...revision,
    logoMediaReady: mediaReady(revision.organizationId, revision.logoMediaId),
    appIconMediaReady: mediaReady(revision.organizationId, revision.appIconMediaId),
  };
}

function find(organizationId: string, status: OrgBrandRevisionStatus): OrgBrandRevision | null {
  const found = revisions.find(
    (revision) => revision.organizationId === organizationId && revision.status === status,
  );
  return found ? withMediaReadiness(found) : null;
}

/** Оба медиа-поля бренда отвергаются одинаково — своим сообщением триггера на каждое. */
function assertBrandMediaOwnedByOrganization(input: SaveOrgBrandDraftInput): void {
  const checks = [
    { mediaId: input.logoMediaId, error: 'org_brand_logo_media_must_be_owned_by_organization' },
    {
      mediaId: input.appIconMediaId,
      error: 'org_brand_app_icon_media_must_be_owned_by_organization',
    },
  ];
  for (const check of checks) {
    if (!check.mediaId) continue;
    const asset = media.get(check.mediaId);
    if (!asset || asset.organizationId === null || asset.organizationId !== input.organizationId) {
      throw new Error(check.error);
    }
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
      assertBrandMediaOwnedByOrganization(input);
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
        existing.appIconMediaId = input.appIconMediaId;
        existing.updatedAt = now;
        return withMediaReadiness(existing);
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
        appIconMediaId: input.appIconMediaId,
        appIconMediaReady: false,
        createdByPlatformUserId: input.actorPlatformUserId,
        publishedByPlatformUserId: null,
        archivedByPlatformUserId: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      revisions.push(draft);
      return withMediaReadiness(draft);
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
      return withMediaReadiness(draft);
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
