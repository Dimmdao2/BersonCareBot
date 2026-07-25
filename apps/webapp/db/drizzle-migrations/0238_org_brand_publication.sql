-- 0238_org_brand_publication — UX-05 slice B1: the organization brand-profile publication
-- foundation (backend only, no UI). Authority:
-- docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md §3 invariants, §5.1 core-vs-paid
-- split, §10 failure matrix, §11 "Organization brand profile: draft/.../published; revision + actor".
--
-- PUBLICATION MODEL — ONE table, status + published_at ON THE REVISION, no separate
-- `published_revision_id` pointer. Why (deliberate choice, the alternative was rejected):
--   * a pointer column in a second `org_brand_profiles` table is a SECOND source of truth for
--     "what is live". Nothing in PostgreSQL can declaratively keep a pointer and a revision status
--     consistent (no FK can say "the referenced row must have status='published' AND belong to the
--     same organization"), so the pair can silently diverge — pointer at a draft, pointer at an
--     archived row, or a published revision nothing points at. Every reader would then need to pick
--     a tie-breaker, and the presentation layer is exactly where §3.6 forbids improvisation.
--   * status on the revision makes "at most one published revision per organization" a real
--     database invariant: `uq_org_brand_revisions_published` (partial UNIQUE on organization_id
--     WHERE status = 'published'). A pointer model cannot express that at all.
--   * the patient read policy below then needs ONE predicate on ONE table (`status = 'published'`)
--     instead of traversing a profile row it must also be allowed to read.
--   * history is preserved by `archived` revisions (§3.8: a brand/tariff change never deletes
--     identity, enrollment, clinical history or audit trail). Publishing archives the previous
--     published revision instead of overwriting it; DELETE is granted to nobody.
--
-- STATE MACHINE (enforced in the DB by app.guard_org_brand_revision(), not only in the service):
--   INSERT -> 'draft' only (publication is always an audited transition, never an insert)
--   draft     -> draft (edit) | published (publish: published_at + published_by stamped)
--   published -> archived (unpublish / superseded by a newer publish) and NOTHING else; live
--                presentation can therefore only change through an explicit publish transition
--   archived  -> immutable forever (append-only audit trail)
--
-- LOGO — reuses the EXISTING media infrastructure (public.media_files + the `/api/media/<uuid>`
-- convention already used by lfk_exercise_media; see apps/webapp/src/infra/repos/pgLfkExercises.ts).
-- No second media system, no stored URL: only a media_files id is stored and the effective URL is
-- computed by the server (§3.6 — the client never sends the effective logo URL).

CREATE TABLE IF NOT EXISTS public.org_brand_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  -- Paid presentation override of the canonical organization display name. NULL means "use the
  -- canonical core organization name" — core context is never stored here and never gated.
  display_name text,
  -- Paid logo. ON DELETE SET NULL: purging the media file degrades the brand to core context +
  -- name (§10 "Brand draft/invalid asset -> platform fallback + safe org text"); it must never
  -- delete the revision, its display name or its audit trail.
  logo_media_id uuid REFERENCES public.media_files(id) ON DELETE SET NULL,
  -- Actor trail (§11 "revision + actor"): who authored, who published, who retired it.
  created_by_platform_user_id uuid NOT NULL REFERENCES public.platform_users(id),
  published_by_platform_user_id uuid REFERENCES public.platform_users(id),
  archived_by_platform_user_id uuid REFERENCES public.platform_users(id),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_brand_revisions_status_check CHECK (
    status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])
  ),
  CONSTRAINT org_brand_revisions_publication_state_check CHECK (
    (status = 'draft'
      AND published_at IS NULL
      AND archived_at IS NULL
      AND published_by_platform_user_id IS NULL
      AND archived_by_platform_user_id IS NULL)
    OR (status = 'published'
      AND published_at IS NOT NULL
      AND archived_at IS NULL
      AND published_by_platform_user_id IS NOT NULL
      AND archived_by_platform_user_id IS NULL)
    OR (status = 'archived'
      AND archived_at IS NOT NULL
      AND archived_by_platform_user_id IS NOT NULL)
  ),
  CONSTRAINT org_brand_revisions_display_name_check CHECK (
    display_name IS NULL OR (btrim(display_name) <> '' AND length(display_name) <= 120)
  )
);

-- At most one live revision and at most one editable draft per organization.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_brand_revisions_published
  ON public.org_brand_revisions (organization_id)
  WHERE status = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_brand_revisions_draft
  ON public.org_brand_revisions (organization_id)
  WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_org_brand_revisions_org_status
  ON public.org_brand_revisions (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_org_brand_revisions_logo_media
  ON public.org_brand_revisions (logo_media_id)
  WHERE logo_media_id IS NOT NULL;

-- Single write chokepoint for the publication state machine AND for same-organization logo
-- ownership. A composite FK (logo_media_id, organization_id) -> media_files(id, organization_id)
-- was rejected: its only possible ON DELETE actions are CASCADE (would delete the brand revision
-- with its audit trail) or RESTRICT (would make the media purge worker fail with an FK error);
-- SET NULL cannot be used because it would also have to null the NOT NULL organization_id.
-- Readiness (media status/mime) is deliberately NOT checked here — an upload may still be
-- processing; readiness is resolved at read time. Ownership is the security property, so it is
-- enforced at write time. SECURITY INVOKER on purpose: under RLS another organization's media row
-- is invisible to the writer, so the check fails closed twice.
CREATE OR REPLACE FUNCTION app.guard_org_brand_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'org_brand_revision_must_be_created_as_draft';
    END IF;
  ELSE
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'org_brand_revision_organization_is_immutable';
    END IF;
    IF NEW.created_by_platform_user_id IS DISTINCT FROM OLD.created_by_platform_user_id THEN
      RAISE EXCEPTION 'org_brand_revision_author_is_immutable';
    END IF;
    IF OLD.status = 'archived' THEN
      RAISE EXCEPTION 'org_brand_revision_archived_is_immutable';
    END IF;
    IF OLD.status = 'published' THEN
      IF NEW.status <> 'archived' THEN
        RAISE EXCEPTION 'org_brand_revision_published_only_archives';
      END IF;
      IF NEW.display_name IS DISTINCT FROM OLD.display_name
         OR NEW.logo_media_id IS DISTINCT FROM OLD.logo_media_id
         OR NEW.published_at IS DISTINCT FROM OLD.published_at
         OR NEW.published_by_platform_user_id IS DISTINCT FROM OLD.published_by_platform_user_id THEN
        RAISE EXCEPTION 'org_brand_revision_published_content_is_immutable';
      END IF;
    ELSIF NEW.status NOT IN ('draft', 'published') THEN
      RAISE EXCEPTION 'org_brand_revision_draft_transition_not_allowed';
    END IF;
  END IF;

  IF NEW.logo_media_id IS NOT NULL THEN
    PERFORM 1
    FROM public.media_files AS logo
    WHERE logo.id = NEW.logo_media_id
      AND logo.owner_kind = 'organization'
      AND logo.organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'org_brand_logo_media_must_be_owned_by_organization';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS org_brand_revisions_guard ON public.org_brand_revisions;
CREATE TRIGGER org_brand_revisions_guard
  BEFORE INSERT OR UPDATE ON public.org_brand_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_org_brand_revision();

-- RLS. Both policies are fail-closed: no missing-context-open branch is added (restoring that
-- legacy shape is forbidden — see 0218). Neither predicate authorizes anything: they only bound
-- visibility of presentation data, which is applied LAST, after the trusted object/relationship,
-- organization context, capability and entitlement checks (§3.1, §3.2).
ALTER TABLE public.org_brand_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_brand_revisions FORCE ROW LEVEL SECURITY;

-- Staff wall, mirroring the canonical saas_org_dormant_p0_8_* shape: exactly the organization of
-- the signed staff principal, for every command. WITH CHECK repeats USING so a staff writer can
-- never create or move a revision into another organization even if the application passed a wrong
-- id — the DB, not the service, is the last word on the tenant boundary.
DROP POLICY IF EXISTS org_brand_revisions_exact_org_staff ON public.org_brand_revisions;
CREATE POLICY org_brand_revisions_exact_org_staff ON public.org_brand_revisions
  FOR ALL
  USING (
    app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()
  )
  WITH CHECK (
    app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()
  );

-- Patient read wall. A patient may read ONLY the PUBLISHED revision of an organization it is
-- actually enrolled in, and only SELECT. Predicate parts, and why each one is required:
--   * status = 'published' — drafts and archived history are staff-only working/audit state; a
--     patient must never see unpublished presentation (§10 "Brand draft/invalid asset").
--   * app.current_patient_user_id() IS NOT NULL — identity comes only from the protected signed
--     principal, never from a header, host or payload (§3.4, §3.6). Without a patient principal the
--     policy is false, so an unprincipled/anonymous session sees nothing (fail-closed).
--   * EXISTS over org_enrollments joined to be_organizations — the ROW's organization_id must match
--     an ACTIVE enrollment of that exact patient in an ACTIVE organization. It is deliberately
--     matched against `org_brand_revisions.organization_id` and NOT against app.current_org_id():
--     the trusted relationship is the enrollment, and a patient enrolled in A and B must be able to
--     read each organization's own brand while the UI switches context (§5.5) — without the brand
--     or the selected organization ever becoming the authority (§3.1). The same enrollment shape is
--     already used by 0219 for the current-patient entitlement projection.
-- Note what this policy does NOT do: it grants no other column, table or organization, and being
-- able to read a brand never implies access to any clinical or booking object.
DROP POLICY IF EXISTS org_brand_revisions_enrolled_patient_published_read
  ON public.org_brand_revisions;
CREATE POLICY org_brand_revisions_enrolled_patient_published_read ON public.org_brand_revisions
  FOR SELECT
  USING (
    status = 'published'
    AND app.current_patient_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.org_enrollments AS enrollment
      INNER JOIN public.be_organizations AS organization
        ON organization.id = enrollment.organization_id
       AND organization.is_active = true
      WHERE enrollment.organization_id = org_brand_revisions.organization_id
        AND enrollment.platform_user_id = app.current_patient_user_id()
        AND enrollment.status = 'active'
    )
  );

REVOKE ALL ON TABLE public.org_brand_revisions FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    -- No DELETE and no TRUNCATE: brand history is append-only (§3.8). "Unpublish" archives.
    GRANT SELECT, INSERT, UPDATE ON TABLE public.org_brand_revisions TO app_staff;
    REVOKE DELETE, TRUNCATE ON TABLE public.org_brand_revisions FROM app_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT SELECT ON TABLE public.org_brand_revisions TO app_patient;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.org_brand_revisions FROM app_patient;
  END IF;
END
$grants$;

REVOKE ALL ON FUNCTION app.guard_org_brand_revision() FROM PUBLIC;

-- Safe rollback / degradation contract:
--   * application rollback leaves this table dormant: nothing reads it unless the branding
--     resolver runs, and with the `branding` mechanic off the resolver returns core context only,
--     while published rows are retained and never deleted (§10 "Branding entitlement off").
--   * destructive removal of the table is permitted only before any real revision exists, by a
--     separately owner-authorized migration.
--   * re-introducing a missing-context-open policy on this table is forbidden.
