#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { runWithDbPatientPrincipal, runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import {
  createWebappPoolProvider,
  getWebappPoolRoutingMetrics,
} from '@/infra/db/webappPoolProvider';

const ORG_A = 'a0000000-0000-4000-8000-000000000001';
const USER_A = 'a0000000-0000-4000-8000-000000000002';
const APPOINTMENT_A = 'a0000000-0000-4000-8000-000000000005';
const ORG_B = 'b0000000-0000-4000-8000-000000000001';
const USER_B = 'b0000000-0000-4000-8000-000000000002';
const APPOINTMENT_B = 'b0000000-0000-4000-8000-000000000005';

type EvidenceRow = {
  id: string;
  current_role: string;
  login_role: string;
  context_org: string | null;
  context_patient: string | null;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

const pool = createWebappPoolProvider({
  staffConnectionString: requiredEnvironment('A1_DATABASE_URL_STAFF'),
  nonstaffConnectionString: requiredEnvironment('A1_DATABASE_URL_NONSTAFF'),
});

/**
 * Every appointment row the caller can actually see, split by tenant.
 *
 * `appointmentById` proves "this row is visible / that row is not" — it cannot see a policy that
 * returns a SUBSET of the caller's own rows, because it only ever asks for one known id. That
 * partial-visibility mode exists on this database in the wild: the tenant's data is there, the
 * policy hands back part of it, no error is raised anywhere. Asserting an exact own-tenant count
 * turns silent-zero, partial visibility and cross-tenant leakage into a single comparison.
 */
async function appointmentVisibility(
  organizationId: string,
): Promise<{ own: number; foreign: number }> {
  const result = await pool.query<{ own: string; foreign: string }>(
    `SELECT
       count(*) FILTER (WHERE organization_id = $1::uuid)::text AS own,
       count(*) FILTER (WHERE organization_id <> $1::uuid)::text AS foreign
     FROM public.be_appointments`,
    [organizationId],
  );
  return {
    own: Number(result.rows[0]?.own ?? -1),
    foreign: Number(result.rows[0]?.foreign ?? -1),
  };
}

async function appointmentById(id: string): Promise<EvidenceRow[]> {
  const result = await pool.query<EvidenceRow>(
    `SELECT
       id::text,
       current_user::text AS current_role,
       session_user::text AS login_role,
       app.current_org_id()::text AS context_org,
       app.current_patient_user_id()::text AS context_patient
     FROM public.be_appointments
     WHERE id = $1::uuid`,
    [id],
  );
  return result.rows;
}

async function proveStaffTenant(
  organizationId: string,
  platformUserId: string,
  ownAppointmentId: string,
  foreignAppointmentId: string,
): Promise<void> {
  await runWithDbStaffPrincipal(
    { organizationId, platformUserId, source: 'a1-real-postgres-conformance' },
    async () => {
      const own = await appointmentById(ownAppointmentId);
      assert.equal(own.length, 1);
      assert.equal(own[0]?.current_role, 'app_staff');
      assert.equal(own[0]?.login_role, 'app_runtime_staff_login');
      assert.equal(own[0]?.context_org, organizationId);
      assert.equal(own[0]?.context_patient, null);
      assert.deepEqual(await appointmentById(foreignAppointmentId), []);
      // Exact-count wall: 2 own rows (the fixture seeds two per tenant), 0 foreign. A subset
      // (own < 2) is partial visibility; own === 0 is the silent-zero class; foreign > 0 is a
      // cross-tenant leak. None of the three raises an error on its own.
      assert.deepEqual(await appointmentVisibility(organizationId), { own: 2, foreign: 0 });
    },
  );
}

async function provePatientTenant(
  organizationId: string,
  platformUserId: string,
  ownAppointmentId: string,
  foreignAppointmentId: string,
): Promise<void> {
  await runWithDbPatientPrincipal(
    { organizationId, platformUserId, source: 'a1-real-postgres-conformance' },
    async () => {
      const own = await appointmentById(ownAppointmentId);
      assert.equal(own.length, 1);
      assert.equal(own[0]?.current_role, 'app_patient');
      assert.equal(own[0]?.login_role, 'app_runtime_nonstaff_login');
      assert.equal(own[0]?.context_org, organizationId);
      assert.equal(own[0]?.context_patient, platformUserId);
      assert.deepEqual(await appointmentById(foreignAppointmentId), []);
      assert.deepEqual(await appointmentVisibility(organizationId), { own: 2, foreign: 0 });
    },
  );
}

try {
  await assert.rejects(
    pool.query('SELECT 1'),
    /DB principal context is required before scoped DB access in locked mode/u,
  );
  await proveStaffTenant(ORG_A, USER_A, APPOINTMENT_A, APPOINTMENT_B);
  await proveStaffTenant(ORG_B, USER_B, APPOINTMENT_B, APPOINTMENT_A);
  await provePatientTenant(ORG_A, USER_A, APPOINTMENT_A, APPOINTMENT_B);
  await provePatientTenant(ORG_B, USER_B, APPOINTMENT_B, APPOINTMENT_A);

  const metrics = getWebappPoolRoutingMetrics(pool);
  assert.ok(metrics);
  assert.equal(metrics.missingPrincipalSelections, 1);
  assert.ok(metrics.staffSelections >= 4);
  assert.ok(metrics.nonstaffSelections >= 4);

  console.log(
    JSON.stringify({
      status: 'PASS',
      boundary: 'createWebappPoolProvider',
      principals: ['staff', 'patient'],
      organizations: 2,
      ownOrgAccess: true,
      crossOrgDenied: true,
      missingPrincipalDenied: true,
    }),
  );
} finally {
  await pool.end();
}
