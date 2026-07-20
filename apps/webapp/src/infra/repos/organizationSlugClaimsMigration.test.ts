import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  repoDir,
  '../../../db/drizzle-migrations/0218_u6b_organization_slug_claims.sql',
);
const schemaPath = join(repoDir, '../../../db/schema/clinicDirectory.ts');
const journalPath = join(repoDir, '../../../db/drizzle-migrations/meta/_journal.json');
const resolverPath = join(
  repoDir,
  '../../../../../deploy/postgres/public-clinic-slug-bootstrap-resolver.sql',
);

describe('0218 organization slug foundation', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const schema = readFileSync(schemaPath, 'utf8');
  const resolver = readFileSync(resolverPath, 'utf8');

  it('preflights existing directory slugs and adopts them without changing publication', () => {
    expect(migration).toContain('U6B.0218 prerequisites are missing');
    expect(migration).toContain('outside the canonical namespace contract');
    expect(migration).toContain(
      'INSERT INTO public.organization_slug_claims (slug, kind, organization_id)',
    );
    expect(migration).toContain('FROM public.clinic_public_directory_entries AS directory');
    expect(migration).not.toMatch(
      /UPDATE public\.clinic_public_directory_entries\s+SET is_published/,
    );
  });

  it('enforces normalized/reserved/global uniqueness and one current slug per organization', () => {
    for (const fragment of [
      'organization_slug_claims_slug_format_check',
      'organization_slug_claims_slug_reserved_check',
      'uq_organization_slug_claims_slug',
      'uq_organization_slug_claims_current_org',
      'uq_organization_slug_claims_reservation_org',
    ]) {
      expect(migration).toContain(fragment);
      expect(schema).toContain(fragment);
    }
    expect(migration).toContain("slug NOT LIKE '%--%'");
    expect(migration).toContain("'api', 'app', 'auth', 'book', 'booking'");
  });

  it('binds reservations to an existing organization and gives every hot path an index', () => {
    expect(migration).toContain('organization_id uuid NOT NULL');
    expect(migration).not.toContain('signup_intent_id');
    expect(migration).not.toContain('expires_at');
    expect(schema).not.toContain('signupIntentId');
    expect(schema).not.toContain('expiresAt');
    expect(migration).toContain('idx_organization_slug_claims_org_kind');
    expect(migration).toContain('idx_organization_slug_rename_events_org_created');
  });

  it('makes aliases and rename audit immutable and structurally prevents redirect chains', () => {
    expect(migration).toContain('organization slug aliases are immutable');
    expect(migration).toContain('durable organization slug claims cannot be deleted');
    expect(migration).toContain('organization slug rename audit is append-only');
    expect(migration).toContain(
      'organization slug rename requires retained alias, synchronized directory and audit event',
    );
    expect(migration).toContain(
      'organization slug alias requires direct current target and audit event',
    );
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON public.organization_slug_rename_events',
    );
    expect(schema).not.toContain('targetSlug');
    expect(schema).not.toContain('target_slug: text("target_slug")');
  });

  it('uses fail-closed exact-org RLS and removes the legacy missing-context-open directory policy', () => {
    expect(migration).toContain('organization_id = app.current_org_id()');
    expect(migration).toContain('FOR ALL TO app_staff');
    expect(migration).toContain(
      'DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.clinic_public_directory_entries',
    );
    expect(migration).not.toContain("NULLIF(current_setting('app.org', true), '') IS NULL OR");
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public.organization_slug_claims FROM app_patient',
    );
  });

  it('exposes alias resolution only through a narrow published bootstrap capability', () => {
    for (const fragment of [
      'CREATE OR REPLACE FUNCTION app.resolve_public_organization_slug(p_slug text)',
      'SECURITY DEFINER',
      'SET search_path = pg_catalog',
      'ALTER FUNCTION app.resolve_public_organization_slug(text) OWNER TO app_owner',
      'REVOKE ALL ON FUNCTION app.resolve_public_organization_slug(text) FROM PUBLIC',
      'GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO app_patient',
      'directory.is_published = true',
      'organization.is_active = true',
    ]) {
      expect(resolver).toContain(fragment);
    }
    expect(resolver).not.toContain(
      'GRANT SELECT ON TABLE public.organization_slug_claims TO app_patient',
    );
    expect(resolver).toContain(
      'CREATE OR REPLACE FUNCTION app.resolve_public_organization_by_slug(p_slug text)',
    );
  });

  it('records a non-destructive rollback contract and the post-0217 journal slot', () => {
    expect(migration).toContain('application rollback leaves these dormant tables');
    expect(migration).toContain(
      'Restoring the legacy missing-context-open 0205 policy is forbidden',
    );
    const journal = readFileSync(journalPath, 'utf8');
    expect(journal).toContain('"idx": 217');
    expect(journal).toContain('"tag": "0217_platform_lfk_ownership"');
    expect(journal).toContain('"idx": 218');
    expect(journal).toContain('"tag": "0218_u6b_organization_slug_claims"');
  });
});
