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
    expect(migration).toContain(
      "CREATE POLICY org_brand_revisions_enrolled_patient_published_read ON public.org_brand_revisions",
    );
    expect(migration).toContain("FOR SELECT");
    expect(migration).toContain("status = 'published'");
    expect(migration).toContain("AND app.current_patient_user_id() IS NOT NULL");
    expect(migration).toContain("FROM public.org_enrollments AS enrollment");
    expect(migration).toContain("WHERE enrollment.organization_id = org_brand_revisions.organization_id");
    expect(migration).toContain("AND enrollment.platform_user_id = app.current_patient_user_id()");
    expect(migration).toContain("AND enrollment.status = 'active'");
    expect(migration).toContain("AND organization.is_active = true");
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
