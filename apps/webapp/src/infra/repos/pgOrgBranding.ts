import { sql } from 'drizzle-orm';
/**
 * UX-05 slice B1 — PostgreSQL implementation of the organization brand publication port
 * (migration 0238_org_brand_publication.sql).
 *
 * Every statement is organization-scoped by parameter AND by RLS: the staff policy
 * `org_brand_revisions_exact_org_staff` re-checks `organization_id = app.current_org_id()` for
 * reads and writes, so a wrong organization id cannot be written even if it reached this layer.
 * The `/api/media/<uuid>` logo readiness is computed here in SQL from `public.media_files` — the
 * same media infrastructure `lfk_exercise_media` uses — and never from client input.
 *
 * No statement here reads a table the calling role is not supposed to hold privileges on: the core
 * organization context goes through `app.read_org_brand_core_context()` (0238), not through
 * `public.be_organizations`. See the audit note on getCoreContext below.
 */
import {
  getWebappSqlDb,
  runWebappPgText,
  runWebappSql,
  runWebappTransaction,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import type {
  CoreOrganizationContext,
  OrgBrandRevision,
  OrgBrandRevisionStatus,
  OrgBrandingPort,
  SaveOrgBrandDraftInput,
} from '@/modules/org-branding/ports';
import { ORG_BRAND_REVISION_STATUSES } from '@/modules/org-branding/ports';

type CoreRow = {
  organization_id: string;
  display_name: string;
  is_active: boolean;
};

type RevisionRow = {
  id: string;
  organization_id: string;
  status: string;
  display_name: string | null;
  patient_app_name: string | null;
  accent_token: string | null;
  logo_media_id: string | null;
  logo_media_ready: boolean;
  created_by_platform_user_id: string;
  published_by_platform_user_id: string | null;
  archived_by_platform_user_id: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function parseStatus(value: string): OrgBrandRevisionStatus {
  if ((ORG_BRAND_REVISION_STATUSES as readonly string[]).includes(value)) {
    return value as OrgBrandRevisionStatus;
  }
  throw new Error(`Unexpected org_brand_revisions.status: ${value}`);
}

function mapRevision(row: RevisionRow): OrgBrandRevision {
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: parseStatus(row.status),
    displayName: row.display_name,
    patientAppName: row.patient_app_name,
    accentToken: row.accent_token,
    logoMediaId: row.logo_media_id,
    logoMediaReady: row.logo_media_ready === true,
    createdByPlatformUserId: row.created_by_platform_user_id,
    publishedByPlatformUserId: row.published_by_platform_user_id,
    archivedByPlatformUserId: row.archived_by_platform_user_id,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Logo readiness predicate. All four conditions are required for the asset to be applied:
 * owned by an organization (never a platform asset), owned by THIS organization, upload finished,
 * and an image. Anything else leaves `logo_media_ready = false` so presentation degrades.
 */
const revisionSelectSql = `
  SELECT
    revision.id::text AS id,
    revision.organization_id::text AS organization_id,
    revision.status,
    revision.display_name,
    revision.patient_app_name,
    revision.accent_token,
    revision.logo_media_id::text AS logo_media_id,
    (logo.id IS NOT NULL) AS logo_media_ready,
    revision.created_by_platform_user_id::text AS created_by_platform_user_id,
    revision.published_by_platform_user_id::text AS published_by_platform_user_id,
    revision.archived_by_platform_user_id::text AS archived_by_platform_user_id,
    revision.published_at,
    revision.archived_at,
    revision.created_at,
    revision.updated_at
  FROM public.org_brand_revisions AS revision
  LEFT JOIN public.media_files AS logo
    ON logo.id = revision.logo_media_id
   AND logo.owner_kind = 'organization'
   AND logo.organization_id = revision.organization_id
   AND logo.status = 'ready'
   AND logo.mime_type LIKE 'image/%'
  WHERE revision.organization_id = $1::uuid
    AND revision.status = $2::text
  LIMIT 1
`;

async function selectRevision(
  organizationId: string,
  status: OrgBrandRevisionStatus,
  db?: WebappSqlExecutor,
): Promise<OrgBrandRevision | null> {
  const { rows } = db
    ? await runWebappPgText<RevisionRow>(revisionSelectSql, [organizationId, status], db)
    : await runWebappPgText<RevisionRow>(revisionSelectSql, [organizationId, status]);
  const row = rows[0];
  return row ? mapRevision(row) : null;
}

export function createPgOrgBrandingPort(): OrgBrandingPort {
  return {
    /**
     * Core organization context comes from the SECURITY DEFINER accessor added by 0238, NEVER from a
     * direct read of `public.be_organizations` here. The independent audit (2026-07-25, HIGH 1)
     * proved the direct read is undeliverable for the patient path: app_patient holds no privileges on
     * that table (SQLSTATE 42501), and even with a grant its FORCE-RLS read policies are
     * {app_staff} / {app_platform_settings} only, so the resolver would have thrown
     * `org_branding_core_context_unavailable` and violated §3.3 (degrade to platform visuals + the
     * canonical organization name, never an anonymous surface). The accessor evaluates the same
     * visibility rules as app_owner: staff of exactly that organization, or a patient with an ACTIVE
     * enrollment in it — anything else (including an unprincipled session) returns zero rows, so the
     * fail-closed behaviour is unchanged.
     */
    async getCoreContext(organizationId: string): Promise<CoreOrganizationContext | null> {
      const { rows } = await runWebappSql<CoreRow>(
        getWebappSqlDb(),
        sql`SELECT core.organization_id::text AS organization_id, core.display_name, core.is_active
         FROM app.read_org_brand_core_context(${organizationId}::uuid) AS core
         LIMIT 1`,
      );
      const row = rows[0];
      if (!row) return null;
      return {
        organizationId: row.organization_id,
        displayName: row.display_name,
        isActive: row.is_active === true,
      };
    },

    async getPublishedRevision(organizationId: string): Promise<OrgBrandRevision | null> {
      return selectRevision(organizationId, 'published');
    },

    async getDraftRevision(organizationId: string): Promise<OrgBrandRevision | null> {
      return selectRevision(organizationId, 'draft');
    },

    async saveDraft(input: SaveOrgBrandDraftInput): Promise<OrgBrandRevision> {
      // `uq_org_brand_revisions_draft` is the conflict target: one editable draft per organization.
      // The 0238 trigger rejects a logo that is not owned by this organization.
      await runWebappSql(
        getWebappSqlDb(),
        sql`INSERT INTO public.org_brand_revisions (
           organization_id, status, display_name, patient_app_name, accent_token, logo_media_id,
           created_by_platform_user_id
         ) VALUES (${input.organizationId}::uuid, 'draft', ${input.displayName}::text, ${input.patientAppName}::text, ${input.accentToken}::text, ${input.logoMediaId}::uuid, ${input.actorPlatformUserId}::uuid)
         ON CONFLICT (organization_id) WHERE status = 'draft'
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           patient_app_name = EXCLUDED.patient_app_name,
           accent_token = EXCLUDED.accent_token,
           logo_media_id = EXCLUDED.logo_media_id,
           updated_at = now()`,
      );
      const draft = await selectRevision(input.organizationId, 'draft');
      if (!draft) throw new Error('org_brand_draft_save_failed');
      return draft;
    },

    async publishDraft(input: {
      organizationId: string;
      actorPlatformUserId: string;
    }): Promise<OrgBrandRevision | null> {
      return runWebappTransaction(async (tx) => {
        // Nothing to publish must leave the live revision untouched: lock the draft FIRST, so a
        // publish without a draft can never archive (and thus unpublish) a live brand.
        const draft = await runWebappSql<{ id: string }>(
          tx,
          sql`SELECT id::text AS id
           FROM public.org_brand_revisions
           WHERE organization_id = ${input.organizationId}::uuid AND status = 'draft'
           FOR UPDATE`,
        );
        if (draft.rows.length === 0) return null;

        // `uq_org_brand_revisions_published` allows only one live revision, and the previous one is
        // retained as history rather than overwritten (§3.8).
        await runWebappSql(
          tx,
          sql`UPDATE public.org_brand_revisions
           SET status = 'archived',
               archived_at = now(),
               archived_by_platform_user_id = ${input.actorPlatformUserId}::uuid
           WHERE organization_id = ${input.organizationId}::uuid AND status = 'published'`,
        );
        const { rows } = await runWebappSql<{ id: string }>(
          tx,
          sql`UPDATE public.org_brand_revisions
           SET status = 'published',
               published_at = now(),
               published_by_platform_user_id = ${input.actorPlatformUserId}::uuid
           WHERE organization_id = ${input.organizationId}::uuid AND status = 'draft'
           RETURNING id::text AS id`,
        );
        if (rows.length === 0) return null;
        return selectRevision(input.organizationId, 'published', tx);
      });
    },

    async unpublish(input: {
      organizationId: string;
      actorPlatformUserId: string;
    }): Promise<boolean> {
      const { rows } = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`UPDATE public.org_brand_revisions
         SET status = 'archived',
             archived_at = now(),
             archived_by_platform_user_id = ${input.actorPlatformUserId}::uuid
         WHERE organization_id = ${input.organizationId}::uuid AND status = 'published'
         RETURNING id::text AS id`,
      );
      return rows.length > 0;
    },
  };
}
