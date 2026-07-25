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
--
-- ══ REVISED 2026-07-25 after the INDEPENDENT ADVERSARIAL AUDIT of this migration (run against a
--    from-dump database with real signed principals; verdict SHIP-BLOCKED, 2 HIGH defects). This file
--    was not yet applied to TEST or prod, so both fixes are made IN PLACE rather than as a follow-up
--    migration. What changed, and why:
--
--    HIGH 1 — the patient read policy was feature-dead, because an RLS predicate is evaluated with
--    the CALLER's privileges. The first version inlined `EXISTS (SELECT 1 FROM public.org_enrollments
--    JOIN public.be_organizations …)` into the policy, and app_patient holds ZERO privileges on
--    public.be_organizations, so EVERY patient SELECT on this table hard-failed with
--      ERROR: permission denied for table be_organizations (SQLSTATE 42501).
--    It failed CLOSED (no leak), but "an enrolled patient may read the published revision" was
--    undeliverable and any patient surface would have 500'd. Granting the table would NOT have fixed
--    it: public.be_organizations is FORCE RLS with read policies for {app_staff} /
--    {app_platform_settings} only, so a patient would still have seen zero rows — and the same
--    blocker hit pgOrgBranding.getCoreContext(), which read be_organizations directly as the patient,
--    so resolveEffectiveOrgBranding() would have thrown `org_branding_core_context_unavailable`
--    instead of degrading to platform visuals + the canonical organization name (§3.3/§10 forbid the
--    anonymous surface). Second, same-root finding the audit proved: because a SELECT policy is also
--    evaluated for `UPDATE … WHERE`, staff READS AND WRITES silently depended on app_staff keeping
--    SELECT on public.org_enrollments — one revoked grant on an unrelated table would have killed the
--    feature for both roles. FIX: both reads now go through SECURITY DEFINER accessors owned by
--    app_owner (see the "PRIVILEGE-INDEPENDENT READ SEAM" section below); the policy and the
--    core-context read no longer require the caller to hold privileges on any other table. The read
--    SET is unchanged from what the audit reviewed as safe.
--
--    HIGH 2 — `logo_media_id … ON DELETE SET NULL` was dead code that BROKE the media purge. The FK's
--    internal `UPDATE ONLY public.org_brand_revisions SET logo_media_id = NULL` fires
--    app.guard_org_brand_revision(), which forbade any UPDATE of a published/archived row, so
--    deleting a referenced public.media_files row raised org_brand_revision_published_only_archives /
--    org_brand_revision_archived_is_immutable with SQLSTATE P0001. That is not a theoretical edge:
--    apps/webapp/src/infra/repos/s3MediaStorage.ts purgePendingMediaDeleteBatch() deletes the S3
--    objects FIRST and only tolerates SQLSTATE class 23, so a P0001 would have killed the whole purge
--    batch with the assets already gone (strictPlatformUserPurge has the same exposure). FIX: the
--    guard now tolerates EXACTLY the FK-driven degradation and nothing else (see the tolerance block
--    inside app.guard_org_brand_revision()).

CREATE TABLE IF NOT EXISTS public.org_brand_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  -- Paid presentation override of the canonical organization display name. NULL means "use the
  -- canonical core organization name" — core context is never stored here and never gated.
  display_name text,
  -- Paid logo. ON DELETE SET NULL: purging the media file degrades the brand to core context +
  -- name (§10 "Brand draft/invalid asset -> platform fallback + safe org text"); it must never
  -- delete the revision, its display name or its audit trail. app.guard_org_brand_revision() carries
  -- the matching tolerance so this degradation actually works on published/archived rows too — the
  -- audit proved it raised P0001 and broke the media purge before that branch existed (HIGH 2).
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
    -- FK-DRIVEN LOGO DEGRADATION (audit HIGH 2, 2026-07-25). `logo_media_id … ON DELETE SET NULL`
    -- makes PostgreSQL issue `UPDATE ONLY public.org_brand_revisions SET logo_media_id = NULL` when a
    -- referenced public.media_files row is deleted, and that UPDATE fires this trigger. Without this
    -- branch it raised P0001 on every published/archived row, which broke the media purge worker
    -- (s3MediaStorage.purgePendingMediaDeleteBatch tolerates only SQLSTATE class 23 and had already
    -- deleted the S3 objects) and made the documented §10 degradation "brand invalid asset ->
    -- platform fallback + safe org text" unreachable.
    -- The tolerance is DELIBERATELY the narrowest possible: the ONLY accepted change is
    -- logo_media_id going non-NULL -> NULL. `to_jsonb(NEW) - 'logo_media_id'` vs
    -- `to_jsonb(OLD) - 'logo_media_id'` compares EVERY OTHER column (including status, display_name,
    -- the actor trail, published_at/archived_at and updated_at) whole-row, so it stays correct when a
    -- column is added later. Consequences kept intact: setting a NEW logo on a published/archived row
    -- is still rejected (NEW.logo_media_id would not be NULL), clearing the logo together with any
    -- other edit is still rejected, and updated_at is intentionally NOT re-stamped so exactly one
    -- column of an immutable row ever changes.
    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('published', 'archived')
       AND OLD.logo_media_id IS NOT NULL
       AND NEW.logo_media_id IS NULL
       AND to_jsonb(NEW) - 'logo_media_id' = to_jsonb(OLD) - 'logo_media_id' THEN
      RETURN NEW;
    END IF;

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

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- PRIVILEGE-INDEPENDENT READ SEAM (audit HIGH 1, 2026-07-25).
-- An RLS predicate — and every read the resolver performs — runs with the CALLER's privileges. The
-- branded surface must therefore never depend on the reading role holding privileges on tables it has
-- no business holding privileges on (app_patient has none on public.be_organizations, and app_staff's
-- SELECT on public.org_enrollments is not part of this feature's contract). Both reads are moved
-- behind SECURITY DEFINER accessors built exactly like the established ones —
-- app.current_org_id() / app.is_staff() (deploy/postgres/p2-b-protected-principal-context.sql),
-- app.read_current_patient_organization_entitlements() (0225) and
-- app.read_integrator_smtp_outbound_setting() (0235): owned by app_owner (NOLOGIN, BYPASSRLS, zero
-- members, not request-reachable), `SET search_path` pinned, every reference schema-qualified,
-- EXECUTE revoked from PUBLIC and granted only to the roles that need it.
-- BYPASSRLS does NOT imply table privileges (same lesson as
-- deploy/postgres/public-booking-bootstrap-resolver.sql), so the base GRANTs app_owner needs are
-- restated below; the canonical overlays deploy/postgres/patient-invites-rls.sql and
-- organization-member-invites-rls.sql already grant the same two reads.
--
-- Identity still comes ONLY from the protected signed principal: an unprincipled session gets NULL
-- from app.current_patient_user_id(), the accessor returns false / zero rows, and the surface stays
-- fail-closed. Neither accessor authorizes anything and neither takes any client-supplied value: the
-- organization id argument is only ever matched against the row / the trusted context.

-- (a) "does the CURRENT patient have an ACTIVE enrollment in this ACTIVE organization" — the exact
-- predicate the audit reviewed as safe, verbatim, now evaluated as app_owner instead of as the
-- caller. Matched against the argument (the ROW's organization_id at the call site), never against
-- app.current_org_id(): the trusted relationship is the enrollment, and a patient enrolled in A and B
-- must be able to read each organization's own brand while the UI switches context (§5.5).
CREATE OR REPLACE FUNCTION app.current_patient_has_active_org_enrollment(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    INNER JOIN public.be_organizations AS organization
      ON organization.id = enrollment.organization_id
     AND organization.is_active = true
    WHERE p_organization_id IS NOT NULL
      AND app.current_patient_user_id() IS NOT NULL
      AND enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
$function$;

-- (b) canonical organization display name (§3.4: core context is NOT branding and is never gated by
-- the paid mechanic). Two visibility branches, and NOTHING else:
--   * the SIGNED principal is scoped to exactly that organization (app.current_org_id() =
--     p_organization_id). This is how staff read their own organization's canonical name — the same
--     organization the staff wall below admits. The organization id in the principal is installed by
--     the server through app.install_signed_context() and is HMAC-signed, so it is trusted context,
--     never caller input; is_active is deliberately NOT filtered here, so a deactivated organization
--     still yields its core context and the caller can render that state (that is what the flag is
--     for).
--     WHY NOT app.is_staff() HERE: app.is_staff() is ROLE-DERIVED (current_user = app_staff OR
--     pg_has_role(current_user, app_staff)). Inside a SECURITY DEFINER body current_user IS the
--     definer identity (app_owner), so app.is_staff() is ALWAYS false there — a live scratch run of
--     the first version of this accessor returned 0 rows for a real signed staff principal because of
--     exactly that. Role-derived predicates must stay in the POLICY (where they are evaluated as the
--     caller and need no table privileges), which is precisely where the staff wall below keeps it.
--   * a patient with an ACTIVE enrollment in that organization, via (a) — this is what lets a patient
--     enrolled in A and B read either organization's own core context (§5.5).
-- Anything else — an unprincipled session, a principal scoped to another organization, a patient
-- asking about an organization it is not enrolled in — gets ZERO rows, and the resolver then throws
-- `org_branding_core_context_unavailable` rather than rendering an anonymous surface (§3.3). Cross-
-- organization enumeration is therefore impossible: the only organization a caller can name is the one
-- its own signed context already carries, or one it is actively enrolled in. Deliberate and verified
-- consequence of the first branch: a patient whose signed context the SERVER scoped to organization X
-- reads X's canonical name even if the enrollment is no longer active — that is §3.3's required
-- non-anonymous core identification for the organization it is already signed into, and it yields NO
-- brand revision (the policy below still needs an ACTIVE enrollment, proved live: 0 rows).
CREATE OR REPLACE FUNCTION app.read_org_brand_core_context(p_organization_id uuid)
RETURNS TABLE (organization_id uuid, display_name text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT organization.id, organization.title, organization.is_active
  FROM public.be_organizations AS organization
  WHERE organization.id = p_organization_id
    AND (
      (app.current_org_id() IS NOT NULL AND app.current_org_id() = p_organization_id)
      OR app.current_patient_has_active_org_enrollment(p_organization_id)
    )
  LIMIT 1
$function$;

DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- The definer identity, exactly as 0225/0235 do it. The deploy grants the migrator a temporary
    -- membership in app_owner for the migration step precisely so these ALTERs work, and revokes it
    -- back to zero members afterwards (deploy/host/deploy-test-saas.sh
    -- grant_migrator_app_owner_membership).
    ALTER FUNCTION app.current_patient_has_active_org_enrollment(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.read_org_brand_core_context(uuid) OWNER TO app_owner;
    GRANT SELECT ON TABLE public.org_enrollments, public.be_organizations TO app_owner;
  END IF;
END
$accessor_owner$;

REVOKE ALL ON FUNCTION app.current_patient_has_active_org_enrollment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_org_brand_core_context(uuid) FROM PUBLIC;

DO $accessor_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    -- Staff needs EXECUTE on the enrollment accessor as well: a SELECT policy is also evaluated for
    -- `UPDATE … WHERE`, so the patient policy below is parsed and executed for staff writes too.
    GRANT EXECUTE ON FUNCTION app.current_patient_has_active_org_enrollment(uuid) TO app_staff;
    GRANT EXECUTE ON FUNCTION app.read_org_brand_core_context(uuid) TO app_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.current_patient_has_active_org_enrollment(uuid) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.read_org_brand_core_context(uuid) TO app_patient;
  END IF;
END
$accessor_grants$;

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
--   * app.current_patient_has_active_org_enrollment(organization_id) — the ROW's organization_id must
--     match an ACTIVE enrollment of that exact patient in an ACTIVE organization. The predicate is
--     identical to the one the audit reviewed; it lives in the SECURITY DEFINER accessor above
--     ONLY so that the policy does not need the caller to hold privileges on public.org_enrollments
--     or public.be_organizations (audit HIGH 1: as an inline join it made every patient SELECT fail
--     with 42501, and it silently coupled staff reads/writes to an unrelated table grant).
--     It is deliberately matched against `org_brand_revisions.organization_id` and NOT against
--     app.current_org_id(): the trusted relationship is the enrollment, and a patient enrolled in A
--     and B must be able to read each organization's own brand while the UI switches context (§5.5)
--     — without the brand or the selected organization ever becoming the authority (§3.1).
-- Note what this policy does NOT do: it grants no other column, table or organization, and being
-- able to read a brand never implies access to any clinical or booking object. No table other than
-- public.org_brand_revisions itself is referenced by either policy, so no future grant change on an
-- unrelated table can break or widen this wall.
DROP POLICY IF EXISTS org_brand_revisions_enrolled_patient_published_read
  ON public.org_brand_revisions;
CREATE POLICY org_brand_revisions_enrolled_patient_published_read ON public.org_brand_revisions
  FOR SELECT
  USING (
    status = 'published'
    AND app.current_patient_user_id() IS NOT NULL
    AND app.current_patient_has_active_org_enrollment(organization_id)
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
-- app.current_patient_has_active_org_enrollment(uuid) / app.read_org_brand_core_context(uuid) are the
-- only two app.* functions this migration adds; their ownership, REVOKE and GRANT EXECUTE live with
-- their definitions above. deploy/host/deploy-test-saas.sh pins both in the p2-b preflight ownership
-- normalization AND in the app_owner SECURITY DEFINER inventory/table-grant gate.

-- Safe rollback / degradation contract:
--   * application rollback leaves this table dormant: nothing reads it unless the branding
--     resolver runs, and with the `branding` mechanic off the resolver returns core context only,
--     while published rows are retained and never deleted (§10 "Branding entitlement off").
--   * destructive removal of the table is permitted only before any real revision exists, by a
--     separately owner-authorized migration.
--   * re-introducing a missing-context-open policy on this table is forbidden.
--   * re-inlining either accessor's body back into the policy or into the resolver's SQL is
--     forbidden: it reintroduces audit HIGH 1 (a read that depends on the caller's privileges on
--     another table). The two accessors are dormant on rollback — nothing else calls them.
