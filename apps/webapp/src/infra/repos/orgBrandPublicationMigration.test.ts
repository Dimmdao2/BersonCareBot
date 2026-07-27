import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(repoDir, "../../../db/drizzle-migrations/0238_org_brand_publication.sql");
const journalPath = join(repoDir, "../../../db/drizzle-migrations/meta/_journal.json");
const schemaPath = join(repoDir, "../../../db/schema/orgBranding.ts");
const exceptionsPath = join(
  repoDir,
  "../../../../../docs/_TODO/SAAS_FOUNDATION/scripts/post-phase4-strict-policy-exceptions.mjs",
);
const repoImplPath = join(repoDir, "pgOrgBranding.ts");
const saasDeployPath = join(repoDir, "../../../../../deploy/host/deploy-test-saas.sh");

/**
 * Extracts a single `CREATE POLICY <name> …;` statement from the migration text so a test can assert
 * what the POLICY PREDICATE itself does — the shipped 361a1920c version passed every string match in
 * this file while being feature-dead, because the assertions never looked at the predicate as a unit.
 */
function policyStatement(migration: string, policyName: string): string {
  const start = migration.indexOf(`CREATE POLICY ${policyName} ON public.org_brand_revisions`);
  expect(start).toBeGreaterThan(-1);
  const end = migration.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 1);
}

/** Extracts a `CREATE OR REPLACE FUNCTION app.<name>… $function$ … $function$;` body. */
function functionStatement(migration: string, signature: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  expect(start).toBeGreaterThan(-1);
  const bodyStart = migration.indexOf("$function$", start);
  const bodyEnd = migration.indexOf("$function$", bodyStart + 1);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return migration.slice(start, bodyEnd + "$function$".length);
}

describe("0238 organization brand publication", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const schema = readFileSync(schemaPath, "utf8");

  it("keeps publication on the revision and makes one live revision a DB invariant", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.org_brand_revisions");
    expect(migration).toContain("organization_id uuid NOT NULL REFERENCES public.be_organizations(id)");
    // Both the migration and the drizzle schema declare the same publication invariants.
    for (const fragment of [
      "uq_org_brand_revisions_published",
      "uq_org_brand_revisions_draft",
      "org_brand_revisions_publication_state_check",
      "org_brand_revisions_status_check",
    ]) {
      expect(migration).toContain(fragment);
      expect(schema).toContain(fragment);
    }
    expect(migration).toContain("WHERE status = 'published'");
    expect(migration).toContain("WHERE status = 'draft'");
    expect(schema).toContain("= 'published'");
    expect(schema).toContain("= 'draft'");
    // Explicitly NOT a second source of truth for "what is live": the rejected pointer model is
    // only ever mentioned in the rationale comment, never declared as a column.
    expect(migration).not.toMatch(/published_revision_id\s+uuid/);
    expect(migration).toContain("PUBLICATION MODEL — ONE table");
    expect(schema).not.toContain("publishedRevisionId");
  });

  it("reuses the existing media infrastructure and never stores a URL", () => {
    expect(migration).toContain("logo_media_id uuid REFERENCES public.media_files(id) ON DELETE SET NULL");
    expect(migration).toContain("/api/media/<uuid>");
    expect(migration).not.toMatch(/logo_url|brand_asset|CREATE TABLE[^;]*brand_media/i);
  });

  it("enforces same-organization logo ownership and the publication state machine in the DB", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION app.guard_org_brand_revision()");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("AND logo.owner_kind = 'organization'");
    expect(migration).toContain("AND logo.organization_id = NEW.organization_id");
    for (const failure of [
      "org_brand_logo_media_must_be_owned_by_organization",
      "org_brand_revision_must_be_created_as_draft",
      "org_brand_revision_organization_is_immutable",
      "org_brand_revision_archived_is_immutable",
      "org_brand_revision_published_only_archives",
      "org_brand_revision_published_content_is_immutable",
    ]) {
      expect(migration).toContain(failure);
    }
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.org_brand_revisions");
  });

  it("walls the table with fail-closed exact-organization staff RLS under FORCE RLS", () => {
    expect(migration).toContain("ALTER TABLE public.org_brand_revisions ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("ALTER TABLE public.org_brand_revisions FORCE ROW LEVEL SECURITY;");
    expect(migration).toContain("CREATE POLICY org_brand_revisions_exact_org_staff ON public.org_brand_revisions");
    expect(migration).toContain(
      "app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()",
    );
    // No missing-context-open branch may ever be reintroduced (see 0218).
    expect(migration).not.toContain("app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL");
    expect(migration).not.toContain("NULLIF(current_setting('app.org', true), '') IS NULL OR");
  });

  it("lets an enrolled patient read only the published revision of its own organization", () => {
    const policy = policyStatement(migration, "org_brand_revisions_enrolled_patient_published_read");
    expect(policy).toContain("FOR SELECT");
    expect(policy).toContain("status = 'published'");
    expect(policy).toContain("AND app.current_patient_user_id() IS NOT NULL");
    // The enrollment predicate itself (unchanged semantics) lives in the accessor.
    expect(policy).toContain("app.current_patient_has_active_org_enrollment(organization_id)");
    const accessor = functionStatement(
      migration,
      "app.current_patient_has_active_org_enrollment(p_organization_id uuid)",
    );
    expect(accessor).toContain("FROM public.org_enrollments AS enrollment");
    expect(accessor).toContain("AND enrollment.organization_id = p_organization_id");
    expect(accessor).toContain("AND enrollment.platform_user_id = app.current_patient_user_id()");
    expect(accessor).toContain("AND enrollment.status = 'active'");
    expect(accessor).toContain("AND organization.is_active = true");
    // Fail-closed for an unprincipled session: no patient principal -> false, never "open".
    expect(accessor).toContain("AND app.current_patient_user_id() IS NOT NULL");
  });

  /**
   * Independent adversarial audit, 2026-07-25 (HIGH 1): an RLS predicate is evaluated with the
   * CALLER's privileges, so the original inline `JOIN public.be_organizations` made EVERY patient
   * SELECT fail with `permission denied for table be_organizations` (42501) — app_patient holds no
   * privileges there — and it silently coupled STAFF reads/writes to app_staff keeping SELECT on
   * public.org_enrollments (a SELECT policy is also evaluated for `UPDATE … WHERE`). These assertions
   * exist so that regression cannot come back through either policy or the repository SQL.
   */
  it("never makes a read of this table depend on caller privileges on another table", () => {
    for (const policyName of [
      "org_brand_revisions_exact_org_staff",
      "org_brand_revisions_enrolled_patient_published_read",
    ]) {
      const policy = policyStatement(migration, policyName);
      expect(policy).not.toMatch(/public\.(org_enrollments|be_organizations|media_files|platform_users)/);
      // No sub-SELECT of any kind in the predicate: a table read there runs as the CALLER.
      expect(policy).not.toMatch(/EXISTS\s*\(/);
      expect(policy).not.toMatch(/\bFROM\b/);
    }
    // The repository must not read be_organizations as the caller either — that was the second half
    // of the same defect (resolveEffectiveOrgBranding would have thrown instead of degrading).
    const repoImpl = readFileSync(repoImplPath, "utf8");
    expect(repoImpl).not.toContain("FROM public.be_organizations");
    expect(repoImpl).toContain("FROM app.read_org_brand_core_context($1::uuid) AS core");
  });

  it("builds both read accessors as protected app_owner SECURITY DEFINER functions", () => {
    for (const signature of [
      "app.current_patient_has_active_org_enrollment(p_organization_id uuid)",
      "app.read_org_brand_core_context(p_organization_id uuid)",
    ]) {
      const fn = functionStatement(migration, signature);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog");
      expect(fn).toContain("STABLE");
    }
    for (const call of [
      "ALTER FUNCTION app.current_patient_has_active_org_enrollment(uuid) OWNER TO app_owner;",
      "ALTER FUNCTION app.read_org_brand_core_context(uuid) OWNER TO app_owner;",
      "REVOKE ALL ON FUNCTION app.current_patient_has_active_org_enrollment(uuid) FROM PUBLIC;",
      "REVOKE ALL ON FUNCTION app.read_org_brand_core_context(uuid) FROM PUBLIC;",
      "GRANT EXECUTE ON FUNCTION app.current_patient_has_active_org_enrollment(uuid) TO app_staff;",
      "GRANT EXECUTE ON FUNCTION app.current_patient_has_active_org_enrollment(uuid) TO app_patient;",
      "GRANT EXECUTE ON FUNCTION app.read_org_brand_core_context(uuid) TO app_staff;",
      "GRANT EXECUTE ON FUNCTION app.read_org_brand_core_context(uuid) TO app_patient;",
      // BYPASSRLS is not a table privilege: the definer identity needs the base GRANTs it reads with.
      "GRANT SELECT ON TABLE public.org_enrollments, public.be_organizations TO app_owner;",
    ]) {
      expect(migration).toContain(call);
    }
    // app.is_staff() is role-derived (current_user), so it is ALWAYS false inside a SECURITY DEFINER
    // body — it must stay in the policy, never in the accessor.
    expect(functionStatement(migration, "app.read_org_brand_core_context(p_organization_id uuid)"))
      .not.toContain("app.is_staff()");
    expect(policyStatement(migration, "org_brand_revisions_exact_org_staff")).toContain("app.is_staff()");
  });

  it("registers both accessors in the TEST deploy ownership + app_owner definer gates", () => {
    const deploy = readFileSync(saasDeployPath, "utf8");
    expect(deploy).toContain(
      "ALTER FUNCTION app.current_patient_has_active_org_enrollment(uuid) OWNER TO %I",
    );
    expect(deploy).toContain("ALTER FUNCTION app.read_org_brand_core_context(uuid) OWNER TO %I");
    expect(deploy).toContain(
      "p.proname IN ('current_patient_has_active_org_enrollment', 'read_org_brand_core_context')",
    );
    // The app_owner SECURITY DEFINER inventory is pinned by count and by required table grants.
    // 55 -> 56 (2026-07-26): migration 0240 added app.is_smtp_outbound_configured(), a boolean-only
    // accessor that reports whether an SMTP relay is configured without exposing any of its settings.
    // The deploy has pinned 56 since that migration; this expectation kept saying 55 and had been
    // failing ever since. A frozen-count gate that is permanently red teaches everyone to ignore it,
    // which is exactly how a genuinely new definer function would slip through unnoticed — so the
    // number is corrected here rather than the gate being relaxed.
    // 56 -> 58 (2026-07-26): migration 0245_public_booking_phone_otp_accessors added the two A-3
    // anonymous-booking phone OTP accessors, together with the eight phone_challenges /
    // phone_otp_locks required-grant rows they need. This expectation and the deploy constant move
    // in the same commit, on purpose — they are two independent copies of one frozen number.
    // 58 -> 61 (2026-07-26): migration 0248_otp_decaying_lockout (night plan C-2 step 3) added the
    // three email_otp_locks accessors (find/register/reset), together with the four new
    // email_otp_locks required-grant rows they need. Same discipline: expectation and deploy
    // constant move in the same commit.
    // 61 -> 62 (2026-07-26): migration 0249_email_challenge_purpose_binding (night plan C-2 step 4)
    // added exactly one new accessor, app.email_auth_set_email_challenge_purpose(uuid, text), rather
    // than widening the pinned 4-arg email_auth_insert_email_challenge signature. No new
    // required-grant row: it only UPDATEs email_challenges.purpose, already covered by app_owner's
    // existing UPDATE grant on that table. The four email_auth_find_*_challenge_for_*/
    // _latest_*_for_user accessors also changed (RETURNS TABLE grew a `purpose` column each), but
    // that is a same-name/same-args DROP+CREATE with ownership explicitly re-applied to app_owner --
    // net zero contribution to this count.
    // 62 -> 63 (2026-07-26): migration 0250_c4d_platform_library_read_staff_scope added exactly one
    // new accessor, app.read_platform_media_row(uuid), the platform-library media read bridge that
    // keeps GET /api/media/[id] (and playback/preview/hls siblings) working for the one legitimate
    // non-staff platform-media read once the same migration scopes `c4d_platform_library_read`
    // (lfk_exercises, lfk_exercise_regions, lfk_exercise_media, lfk_complex_templates,
    // lfk_complex_template_exercises, media_files) `TO app_staff`. No new required-grant row: it
    // only reads public.media_files, already covered by app_owner's existing SELECT grant there.
    // 62 -> 70 (2026-07-27): migration 0252 adds five phone-challenge actions and three patient-LFK
    // reads. The live-corrected baseline is 62; the new accessors are reviewed in their focused test.
    expect(deploy).toContain("local expected_secdef_count=70");
    expect(deploy).toContain("('public.org_enrollments', 'SELECT')");
    expect(deploy).toContain("('public.phone_challenges', 'INSERT')");
    expect(deploy).toContain("('public.phone_otp_locks', 'UPDATE')");
    expect(deploy).toContain("('public.email_otp_locks', 'DELETE')");
  });

  /**
   * Audit HIGH 2: `ON DELETE SET NULL` fires this trigger via
   * `UPDATE ONLY public.org_brand_revisions SET logo_media_id = NULL`, which raised P0001 on
   * published/archived rows and killed the media purge batch after the S3 objects were already gone
   * (s3MediaStorage.purgePendingMediaDeleteBatch only tolerates SQLSTATE class 23).
   * The executable proof of the runtime behaviour is
   * orgBrandRevisionGuard.devDb.integration.test.ts; this asserts the tolerance stays narrow.
   */
  it("tolerates exactly the FK-driven logo-NULL degradation and nothing wider", () => {
    const guard = functionStatement(migration, "app.guard_org_brand_revision()");
    // Re-audit M-1: without the depth check the tolerance was a DIRECT write hole -- app_staff could
    // run `UPDATE org_brand_revisions SET logo_media_id = NULL` on a published row (changing the live
    // branded surface) or an archived row (rewriting the append-only audit trail) with no trace,
    // because updated_at is deliberately not re-stamped. The referential-action UPDATE always runs
    // inside the RI trigger of the media_files DELETE (depth >= 2); a direct statement is depth 1.
    expect(guard).toContain("AND pg_trigger_depth() > 1");
    expect(guard).toContain("AND OLD.status IN ('published', 'archived')");
    expect(guard).toContain("AND OLD.logo_media_id IS NOT NULL");
    expect(guard).toContain("AND NEW.logo_media_id IS NULL");
    // Whole-row comparison of EVERY other column, so a later column addition cannot widen it.
    expect(guard).toContain("AND to_jsonb(NEW) - 'logo_media_id' = to_jsonb(OLD) - 'logo_media_id'");
    // The immutability rules themselves are untouched.
    for (const failure of [
      "org_brand_revision_archived_is_immutable",
      "org_brand_revision_published_only_archives",
      "org_brand_revision_published_content_is_immutable",
      "org_brand_revision_organization_is_immutable",
    ]) {
      expect(guard).toContain(failure);
    }
  });

  it("keeps brand history append-only for staff and read-only for patients", () => {
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.org_brand_revisions TO app_staff;");
    expect(migration).toContain("REVOKE DELETE, TRUNCATE ON TABLE public.org_brand_revisions FROM app_staff;");
    expect(migration).toContain("GRANT SELECT ON TABLE public.org_brand_revisions TO app_patient;");
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.org_brand_revisions FROM app_patient;",
    );
    expect(migration).toContain("archived_by_platform_user_id uuid REFERENCES public.platform_users(id)");
  });

  it("takes the post-0237 journal slot and is registered for RLS coverage", () => {
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain('"idx": 237');
    expect(journal).toContain('"tag": "0237_r7_drop_public_rubitime_mirror_tables"');
    expect(journal).toContain('"idx": 238');
    expect(journal).toContain('"tag": "0238_org_brand_publication"');

    const exceptions = readFileSync(exceptionsPath, "utf8");
    expect(exceptions).toContain('"public.org_brand_revisions"');
    expect(exceptions).toContain("0238_org_brand_publication.sql");
  });
});
