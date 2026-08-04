/**
 * Tenant isolation matrix (UZ-3 backlog #5, brief
 * `docs/_TODO/runs/integrator-cleanup/TENANT_ISOLATION_MATRIX_BRIEF_2026-08-04.md`): the owner-named
 * gap was "no matrix negative test in CI proving `специалист клиники A ↔ данные клиники B`" --
 * existing coverage was a fail-closed deploy gate (not a CI test) plus a handful of point tests that
 * each happened to be written for an unrelated bug. This file is the systematic version: it proves,
 * against a real disposable PostgreSQL built from the full migration chain (not a synthetic stub
 * schema), that a clinic-A staff session and a clinic-A-only patient session can never read a
 * clinic-B row, on two real tables from two different product domains.
 *
 * Mechanism: `DB_PRINCIPAL_CONTEXT_MODE=locked` -- the signed principal-context mode DEV/TEST/PROD
 * actually run (`.env.dev`, and `pgSaasBillingCapture.postgres.integration.test.ts`'s header) --
 * NOT the plain `current_setting('app.org', true)` GUC read. Confirmed empirically before writing
 * this file's final version: `public.org_enrollments`'s live policy (as captured by the
 * a0-greenfield baseline this harness restores from) already reads `app.current_org_id()` /
 * `app.current_patient_user_id()`, the SECURITY DEFINER accessors backed by the signed
 * `app.principal_context` table -- a plain `set_config('app.org', ...)` on the connection does
 * nothing under that policy and silently produces a false-empty result for every principal, which
 * would have made every negative assertion below pass vacuously (the exact anti-pattern AGENTS.md
 * §10a/§10b names: "ноль строк без принципала ≠ пустая база"). `app.context_signing_secrets` is
 * empty by default in this migration-only harness, so the fixture seeds a disposable secret the
 * same way `pgSaasBillingCapture.postgres.integration.test.ts` already does, and restores whatever
 * was there before.
 *
 * Full surface enumeration (155 RLS-protected tables, generated from the repo's own RLS descriptor
 * model, not hand-typed) lives in
 * `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_MATRIX_2026-08-04.md`. That doc also names the
 * uncovered classes (denorm_org_column/fk_path/polymorphic_resolver instances not individually
 * exercised, bootstrap-hybrid tables) -- this file exercises two representative `direct_org_column`
 * instances:
 *
 * - `public.org_enrollments` -- the roster table the whole clinic-membership model is built on;
 * - `public.clinical_visit` -- an actual clinical record, the highest-sensitivity class named by
 *   the owner's 04.08 security scope ("журналы, platform_users RLS, ... Тест изоляции").
 *
 * Every negative case ("clinic A never sees clinic B") is paired with a positive control ("clinic A
 * sees its own row") on the SAME query shape, per AGENTS.md §10a/§10b: a negative assertion with no
 * positive pair cannot distinguish "the wall works" from "the table/harness/principal plumbing is
 * just broken". The final `describe` block goes further and proves the negative assertion is
 * falsifiable: it disables the real RLS policy on a throwaway copy of the same tables and shows the
 * identical query then returns the foreign row, before restoring it.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  runWithDbOrganizationPrincipal,
  runWithDbPatientPrincipal,
} from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';
import { withPoolClient } from '@/infra/db/withClient';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

const orgA = randomUUID();
const orgB = randomUUID();
// Patient P only ever belongs to clinic A; patient Q only ever belongs to clinic B -- own-data-only
// model (memory `saas-patient-wall-is-own-data-only`), so P's session must never surface Q's rows.
const patientP = randomUUID();
const patientQ = randomUUID();
const enrollmentP = randomUUID();
const enrollmentQ = randomUUID();
const visitP = randomUUID();
const visitQ = randomUUID();

describe('tenant isolation matrix: clinic A staff/patient never reach clinic B data (disposable Postgres)', () => {
  const pool = getPool();
  let client: PoolClient;
  let originalSigningSecret: string | null = null;

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  /** Real request-shaped read: fresh pool connection, real `SET ROLE`, real signed principal
   *  install/release via `withPoolClient` -- the exact seam `app/api/**` route handlers use. */
  async function selectAsStaff<T = unknown>(
    organizationId: string,
    queryText: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> {
    return runWithDbOrganizationPrincipal(organizationId, () =>
      withPoolClient(pool, async (principalClient) => {
        const result = await runWebappPgText<T>(
          queryText,
          values,
          getWebappSqlFromPgClient(principalClient),
        );
        return result.rows;
      }),
    );
  }

  async function selectAsPatient<T = unknown>(
    platformUserId: string,
    queryText: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> {
    return runWithDbPatientPrincipal({ platformUserId }, () =>
      withPoolClient(pool, async (principalClient) => {
        const result = await runWebappPgText<T>(
          queryText,
          values,
          getWebappSqlFromPgClient(principalClient),
        );
        return result.rows;
      }),
    );
  }

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);

    // Signed locked-context mode (same pattern as pgSaasBillingCapture.postgres.integration.test.ts):
    // seed a disposable secret, point the process at `locked` mode, restore both in afterAll.
    const secret = await run<{ secret: string }>(
      'SELECT secret FROM app.context_signing_secrets WHERE id = true',
    );
    originalSigningSecret = secret.rows[0]?.secret ?? null;
    const disposableSigningSecret =
      'isolation-matrix-disposable-signed-principal-secret-0123456789';
    await run(
      `INSERT INTO app.context_signing_secrets (id, secret) VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret`,
      [disposableSigningSecret],
    );
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = disposableSigningSecret;

    // be_organizations/platform_users/org_enrollments/clinical_visit all carry FORCE ROW LEVEL
    // SECURITY in this harness (empirically confirmed, not assumed) -- the connecting owner
    // connection is not exempt, so every fixture insert needs RLS off around it.
    await run('ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run(
      `INSERT INTO public.be_organizations (id, title, is_active) VALUES ($1, 'isolation-matrix clinic A', true), ($2, 'isolation-matrix clinic B', true)`,
      [orgA, orgB],
    );
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await run('ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY');

    await run('ALTER TABLE public.platform_users DISABLE ROW LEVEL SECURITY');
    await run(`INSERT INTO public.platform_users (id) VALUES ($1), ($2)`, [patientP, patientQ]);
    await run('ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY');

    await run('ALTER TABLE public.org_enrollments DISABLE ROW LEVEL SECURITY');
    await run(
      `INSERT INTO public.org_enrollments (id, organization_id, platform_user_id) VALUES ($1, $2, $3), ($4, $5, $6)`,
      [enrollmentP, orgA, patientP, enrollmentQ, orgB, patientQ],
    );
    await run('ALTER TABLE public.org_enrollments ENABLE ROW LEVEL SECURITY');

    await run('ALTER TABLE public.clinical_visit DISABLE ROW LEVEL SECURITY');
    await run(
      `INSERT INTO public.clinical_visit (id, organization_id, patient_user_id, visit_type, visited_at, created_by)
       VALUES
         ($1, $2, $3, 'first', '2026-01-15T09:00:00.000Z', $3),
         ($4, $5, $6, 'first', '2026-01-16T09:00:00.000Z', $6)`,
      [visitP, orgA, patientP, visitQ, orgB, patientQ],
    );
    await run('ALTER TABLE public.clinical_visit ENABLE ROW LEVEL SECURITY');

    // app_staff/app_patient hold no base GRANT on these two tables in a migration-only harness (the
    // grant lives in a deploy/postgres overlay this harness does not apply) -- same reasoning as
    // saasBillingPaidTariffApplyAccessor.postgres.integration.test.ts's be_organizations grant.
    await run(
      'GRANT SELECT ON TABLE public.org_enrollments, public.clinical_visit TO app_staff, app_patient',
    );
  });

  afterAll(async () => {
    await run(
      'REVOKE SELECT ON TABLE public.org_enrollments, public.clinical_visit FROM app_staff, app_patient',
    );
    // Same FORCE RLS reasoning as the fixture insert above: the owner connection carries no
    // principal, so a delete against a FORCE-RLS table with RLS still enabled silently matches zero
    // rows instead of erroring -- disable RLS around the cleanup delete too.
    await run('ALTER TABLE public.clinical_visit DISABLE ROW LEVEL SECURITY');
    await run('DELETE FROM public.clinical_visit WHERE id = ANY($1::uuid[])', [[visitP, visitQ]]);
    await run('ALTER TABLE public.clinical_visit ENABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE public.org_enrollments DISABLE ROW LEVEL SECURITY');
    await run('DELETE FROM public.org_enrollments WHERE id = ANY($1::uuid[])', [
      [enrollmentP, enrollmentQ],
    ]);
    await run('ALTER TABLE public.org_enrollments ENABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE public.platform_users DISABLE ROW LEVEL SECURITY');
    await run('DELETE FROM public.platform_users WHERE id = ANY($1::uuid[])', [
      [patientP, patientQ],
    ]);
    await run('ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run('DELETE FROM public.be_organizations WHERE id = ANY($1::uuid[])', [[orgA, orgB]]);
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await run('ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY');

    if (originalSigningSecret === null) {
      await run('DELETE FROM app.context_signing_secrets WHERE id = true');
    } else {
      await run('UPDATE app.context_signing_secrets SET secret = $1 WHERE id = true', [
        originalSigningSecret,
      ]);
    }

    client.release();
    await pool.end();
  });

  describe('public.org_enrollments (roster: which patient belongs to which clinic)', () => {
    it('positive: clinic A staff sees its own enrollment row', async () => {
      const rows = await selectAsStaff<{ id: string }>(
        orgA,
        'SELECT id FROM public.org_enrollments',
      );
      expect(rows.map((r) => r.id)).toEqual([enrollmentP]);
    });

    it('negative: clinic A staff gets nothing for clinic B, even asking for it by id', async () => {
      const rows = await selectAsStaff<{ id: string }>(
        orgA,
        'SELECT id FROM public.org_enrollments WHERE id = $1',
        [enrollmentQ],
      );
      expect(rows).toEqual([]);
    });

    it('positive: patient P sees their own enrollment row with no org principal set', async () => {
      const rows = await selectAsPatient<{ id: string }>(
        patientP,
        'SELECT id FROM public.org_enrollments',
      );
      expect(rows.map((r) => r.id)).toEqual([enrollmentP]);
    });

    it('negative: patient P (clinic A only) never sees patient Q (clinic B) enrollment row', async () => {
      const rows = await selectAsPatient<{ id: string }>(
        patientP,
        'SELECT id FROM public.org_enrollments WHERE id = $1',
        [enrollmentQ],
      );
      expect(rows).toEqual([]);
    });
  });

  describe('public.clinical_visit (clinical record: the highest-sensitivity class named by the owner)', () => {
    it('positive: clinic A staff sees its own clinic’s visit record', async () => {
      const rows = await selectAsStaff<{ id: string }>(
        orgA,
        'SELECT id FROM public.clinical_visit',
      );
      expect(rows.map((r) => r.id)).toEqual([visitP]);
    });

    it('negative: clinic A staff gets nothing for clinic B’s visit record', async () => {
      const rows = await selectAsStaff<{ id: string }>(
        orgA,
        'SELECT id FROM public.clinical_visit WHERE id = $1',
        [visitQ],
      );
      expect(rows).toEqual([]);
    });

    it('positive: patient P sees their own visit record', async () => {
      const rows = await selectAsPatient<{ id: string }>(
        patientP,
        'SELECT id FROM public.clinical_visit',
      );
      expect(rows.map((r) => r.id)).toEqual([visitP]);
    });

    it('negative: patient P (clinic A) never sees patient Q’s (clinic B) visit record', async () => {
      const rows = await selectAsPatient<{ id: string }>(
        patientP,
        'SELECT id FROM public.clinical_visit WHERE id = $1',
        [visitQ],
      );
      expect(rows).toEqual([]);
    });
  });

  describe('control: the negative assertions above are falsifiable, not reading an empty table', () => {
    it('org_enrollments: the exact negative query returns the foreign row once the wall is removed', async () => {
      await run('ALTER TABLE public.org_enrollments DISABLE ROW LEVEL SECURITY');
      try {
        const rows = await selectAsStaff<{ id: string }>(
          orgA,
          'SELECT id FROM public.org_enrollments WHERE id = $1',
          [enrollmentQ],
        );
        expect(rows.map((r) => r.id)).toEqual([enrollmentQ]);
      } finally {
        await run('ALTER TABLE public.org_enrollments ENABLE ROW LEVEL SECURITY');
      }

      // Wall restored: the real negative assertion is green again on the same query.
      const restored = await selectAsStaff<{ id: string }>(
        orgA,
        'SELECT id FROM public.org_enrollments WHERE id = $1',
        [enrollmentQ],
      );
      expect(restored).toEqual([]);
    });

    it('clinical_visit: the exact negative query returns the foreign row once the wall is removed', async () => {
      await run('ALTER TABLE public.clinical_visit DISABLE ROW LEVEL SECURITY');
      try {
        const rows = await selectAsPatient<{ id: string }>(
          patientP,
          'SELECT id FROM public.clinical_visit WHERE id = $1',
          [visitQ],
        );
        expect(rows.map((r) => r.id)).toEqual([visitQ]);
      } finally {
        await run('ALTER TABLE public.clinical_visit ENABLE ROW LEVEL SECURITY');
      }

      const restored = await selectAsPatient<{ id: string }>(
        patientP,
        'SELECT id FROM public.clinical_visit WHERE id = $1',
        [visitQ],
      );
      expect(restored).toEqual([]);
    });
  });
});
