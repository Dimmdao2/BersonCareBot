import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const migration = readFileSync(
  resolve(repoRoot, 'apps/webapp/db/drizzle-migrations/0182_reference_catalog_snapshots.sql'),
  'utf8',
);
const receiptMigration = readFileSync(
  resolve(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0183_reference_catalog_snapshot_receipts.sql',
  ),
  'utf8',
);
const organizationHookMigration = readFileSync(
  resolve(repoRoot, 'apps/webapp/db/drizzle-migrations/0184_reference_catalog_org_insert_hook.sql'),
  'utf8',
);
const provisioning = readFileSync(
  resolve(repoRoot, 'deploy/postgres/specialist-owner-provisioning-rls.sql'),
  'utf8',
);
const rlsOverlay = readFileSync(
  resolve(repoRoot, 'deploy/postgres/reference-catalog-rls.sql'),
  'utf8',
);
const productionDeploy = readFileSync(resolve(repoRoot, 'deploy/host/deploy-prod.sh'), 'utf8');
const webappProductionDeploy = readFileSync(
  resolve(repoRoot, 'deploy/host/deploy-webapp-prod.sh'),
  'utf8',
);
const devBypassWorkspace = readFileSync(
  resolve(repoRoot, 'apps/webapp/src/infra/repos/pgDevBypassClinicAdminWorkspace.ts'),
  'utf8',
);
const bookingEngineRepo = readFileSync(
  resolve(repoRoot, 'apps/webapp/src/infra/repos/pgBookingEngine.ts'),
  'utf8',
);
const testFixtureSeeder = readFileSync(
  resolve(repoRoot, 'apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts'),
  'utf8',
);

describe('reference catalog snapshot-at-provision contract', () => {
  it('stores a versioned canonical manifest independent from every clinic catalog', () => {
    const manifest = migration.match(/\$baseline\$\n([\s\S]+?)\n\$baseline\$::jsonb/)?.[1];
    expect(manifest).toBeTruthy();
    const parsed = JSON.parse(manifest!) as {
      categories: Array<{ code: string; items: unknown[] }>;
    };
    expect(parsed.categories.map((category) => category.code)).toEqual([
      'body_region',
      'clinical_assessment_kind',
      'diagnosis',
      'disease_stage',
      'load_type',
      'recommendation_type',
      'symptom_type',
      'visit_manipulation',
    ]);
    expect(
      parsed.categories.find((category) => category.code === 'body_region')?.items,
    ).toHaveLength(20);
    const helper = receiptMigration.slice(
      receiptMigration.indexOf('CREATE OR REPLACE FUNCTION app.seed_reference_catalog_snapshot'),
    );
    expect(helper).toContain('FROM public.reference_catalog_baselines');
    expect(helper).not.toContain('FROM public.reference_categories WHERE organization_id <>');
  });

  it('uses per-org uniqueness and an immutable version receipt instead of reconciliation', () => {
    expect(migration.indexOf('LOCK TABLE public.be_organizations')).toBeLessThan(
      migration.indexOf('DO $$'),
    );
    expect(migration).toContain('UNIQUE (organization_id, code)');
    expect(migration).toContain('FOREIGN KEY (category_id, organization_id)');
    expect(receiptMigration).toContain('organization_id uuid PRIMARY KEY');
    expect(receiptMigration).toContain('SELECT baseline_version INTO v_version');
    expect(receiptMigration).toMatch(/IF FOUND THEN\s+RETURN v_version;/);
    expect(receiptMigration.indexOf('IF FOUND THEN')).toBeLessThan(
      receiptMigration.indexOf(
        'FROM public.reference_catalog_baselines',
        receiptMigration.indexOf('IF FOUND THEN'),
      ),
    );
    expect(receiptMigration).not.toMatch(/UPDATE public\.reference_(?:categories|items)/);
  });

  it('seeds the snapshot inside specialist owner provisioning before it returns', () => {
    const orgInsert = provisioning.indexOf('INSERT INTO public.be_organizations');
    const seed = provisioning.indexOf(
      'PERFORM app.seed_reference_catalog_snapshot(v_organization_id)',
    );
    const result = provisioning.indexOf('RETURN QUERY SELECT true', seed);
    expect(orgInsert).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(orgInsert);
    expect(result).toBeGreaterThan(seed);
    expect(provisioning).toContain(
      'REVOKE ALL ON FUNCTION app.seed_reference_catalog_snapshot(uuid) FROM PUBLIC',
    );
    expect(rlsOverlay).toContain(
      'ALTER FUNCTION app.seed_reference_catalog_snapshot(uuid) OWNER TO :"provisioning_owner"',
    );
    expect(rlsOverlay).toContain(
      'GRANT EXECUTE ON FUNCTION app.seed_reference_catalog_snapshot(uuid)',
    );
  });

  it('covers every runtime organization insert path', () => {
    const devOrgInsert = devBypassWorkspace.indexOf('.insert(beOrganizations)');
    const devSeed = devBypassWorkspace.indexOf('app.seed_reference_catalog_snapshot', devOrgInsert);
    expect(devOrgInsert).toBeGreaterThan(-1);
    expect(devSeed).toBeGreaterThan(devOrgInsert);
    expect(devBypassWorkspace.indexOf('runWebappTransaction')).toBeLessThan(devOrgInsert);

    const fixtureOrgInsert = testFixtureSeeder.indexOf('.insert(schema.beOrganizations)');
    const fixtureSeed = testFixtureSeeder.indexOf(
      'app.seed_reference_catalog_snapshot',
      fixtureOrgInsert,
    );
    expect(fixtureOrgInsert).toBeGreaterThan(-1);
    expect(fixtureSeed).toBeGreaterThan(fixtureOrgInsert);

    const upsertOrganization = bookingEngineRepo.slice(
      bookingEngineRepo.indexOf('async upsertOrganization'),
      bookingEngineRepo.indexOf('async listBranches'),
    );
    expect(upsertOrganization).toContain('.update(beOrganizations)');
    expect(upsertOrganization).not.toContain('.insert(beOrganizations)');
    expect(upsertOrganization).toContain('throw new Error("organization_not_found")');
  });

  it('installs the DB-level organization hook under a cutover lock before catch-up', () => {
    const lock = organizationHookMigration.indexOf(
      'LOCK TABLE public.be_organizations IN SHARE ROW EXCLUSIVE MODE',
    );
    const trigger = organizationHookMigration.indexOf(
      'CREATE TRIGGER be_organizations_reference_catalog_snapshot',
    );
    const invalidReceiptRepair = organizationHookMigration.indexOf(
      'DELETE FROM public.reference_catalog_snapshot_receipts receipt',
    );
    const catchUp = organizationHookMigration.indexOf(
      'PERFORM app.seed_reference_catalog_snapshot',
      invalidReceiptRepair,
    );
    expect(lock).toBeGreaterThan(-1);
    expect(trigger).toBeGreaterThan(lock);
    expect(invalidReceiptRepair).toBeGreaterThan(trigger);
    expect(catchUp).toBeGreaterThan(invalidReceiptRepair);
    expect(organizationHookMigration).not.toMatch(
      /INSERT INTO public\.reference_catalog_snapshot_receipts/,
    );
    expect(organizationHookMigration).toContain('AFTER INSERT ON public.be_organizations');
    expect(organizationHookMigration).toContain(
      'DROP POLICY reference_catalog_migration_seed ON public.reference_categories',
    );
    expect(organizationHookMigration).toContain(
      'DROP POLICY reference_catalog_migration_seed ON public.reference_items',
    );
  });

  it.each([
    ['full', productionDeploy, '${SPECIALIST_OWNER_PROVISIONING_RLS}', '${REFERENCE_CATALOG_RLS}'],
    [
      'webapp-only',
      webappProductionDeploy,
      'specialist-owner-provisioning-rls.sql',
      'reference-catalog-rls.sql',
    ],
  ])(
    'refreshes both overlays after %s production migrations and before restart',
    (_name, deploy, provisioningMarker, referenceMarker) => {
      const migrationIndex = deploy.indexOf('pnpm --dir apps/webapp run migrate');
      const provisioningIndex = deploy.indexOf(provisioningMarker, migrationIndex);
      const referenceIndex = deploy.indexOf(referenceMarker, provisioningIndex);
      const restartIndex = deploy.indexOf('systemctl restart "${WEBAPP_SERVICE}"', migrationIndex);
      expect(migrationIndex).toBeGreaterThan(-1);
      expect(provisioningIndex).toBeGreaterThan(migrationIndex);
      expect(referenceIndex).toBeGreaterThan(provisioningIndex);
      expect(restartIndex).toBeGreaterThan(referenceIndex);
    },
  );

  it('keeps patient access read-only and tied to an active enrollment in the selected org', () => {
    expect(rlsOverlay.match(/reference_catalog_patient_select/g)).toHaveLength(4);
    expect(rlsOverlay).toContain('FOR SELECT TO :"reference_catalog_patient_role"');
    expect(rlsOverlay).toContain(
      'enrollment.organization_id = reference_categories.organization_id',
    );
    expect(rlsOverlay).toContain('enrollment.organization_id = reference_items.organization_id');
    expect(rlsOverlay).toContain('enrollment.platform_user_id = app.current_patient_user_id()');
    expect(rlsOverlay).toContain("enrollment.status = 'active'");
    expect(rlsOverlay).not.toMatch(
      /FOR (?:ALL|INSERT|UPDATE|DELETE) TO :"reference_catalog_patient_role"/,
    );
    expect(rlsOverlay).toContain('NOT EXISTS (');
    expect(rlsOverlay).toContain('FROM public.reference_catalog_snapshot_receipts receipt');
  });
});
