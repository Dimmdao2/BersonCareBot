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
  assert.equal(metrics.poolRoleMismatches, 0);
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
      poolRoleMismatches: metrics.poolRoleMismatches,
    }),
  );
} finally {
  await pool.end();
}
