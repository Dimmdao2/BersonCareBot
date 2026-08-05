// VISIBILITY_CD_BRIEF_2026-08-04.md stage C — the port is not wired to any route yet, so these are
// the only tests proving the owner's model ("врач видит своих и тех, кого ему передали; менеджер и
// админ клиники видят записи по всем") before Stage E connects it to a live read.
//
// Арбитр (§10a — mutation checked by hand, not just described):
// 1. `assertPatientVisibleToActor`: drop the `canManageAllSpecialists` early return → "manager sees
//    a patient with zero links" goes red (org-wide access silently lost).
// 2. `assertPatientVisibleToActor` / in-memory port: drop the `organizationId` filter from
//    `hasActiveLink` → "link in another organization does not grant visibility" goes red (tenant
//    wall bypass — the exact failure mode the design doc calls out in §3).
// 3. `buildPatientVisibilityPredicate`: swap the push order to `[actor.specialistId,
//    organizationId]` → "narrow actor appends org+specialist in that exact order" goes red (wrong
//    value lands on the wrong SQL placeholder, silently comparing the wrong column).
// Each was applied by hand against the implementation below and confirmed red before this file
// was kept.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInMemoryPatientVisibilityLinkPort,
  resetInMemoryPatientVisibilityLinksForTests,
} from '@/infra/repos/inMemoryPatientVisibilityLinks';
import type { PatientVisibilityActor } from './ports';
import { buildPatientVisibilityPredicate } from '@/infra/repos/patientVisibilityPredicateSql';
import { createPatientVisibilityService } from './service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PATIENT_ID = '99999999-9999-4999-8999-999999999999';
const SPECIALIST_A = '44444444-4444-4444-8444-444444444444';
const SPECIALIST_OTHER = '55555555-5555-4555-8555-555555555555';

function actor(overrides: Partial<PatientVisibilityActor> = {}): PatientVisibilityActor {
  return {
    membershipRole: 'doctor',
    specialistId: SPECIALIST_A,
    canManageAllSpecialists: false,
    ...overrides,
  };
}

function buildService() {
  return createPatientVisibilityService({
    linkPort: createInMemoryPatientVisibilityLinkPort(),
  });
}

beforeEach(() => {
  resetInMemoryPatientVisibilityLinksForTests([]);
});

describe('assertPatientVisibleToActor', () => {
  it('owner/admin (canManageAllSpecialists) sees any patient in the org — even with zero links, today\'s actual DB state', async () => {
    const service = buildService();
    const visible = await service.assertPatientVisibleToActor({
      patientUserId: PATIENT_ID,
      organizationId: ORG_A,
      actor: actor({ membershipRole: 'owner', canManageAllSpecialists: true, specialistId: null }),
    });
    expect(visible).toBe(true);
  });

  it('bare doctor with no link at all cannot see the patient (no link exists for anyone yet)', async () => {
    const service = buildService();
    const visible = await service.assertPatientVisibleToActor({
      patientUserId: PATIENT_ID,
      organizationId: ORG_A,
      actor: actor(),
    });
    expect(visible).toBe(false);
  });

  it('bare doctor with an active link for their own specialist sees the patient', async () => {
    resetInMemoryPatientVisibilityLinksForTests([
      { organizationId: ORG_A, patientUserId: PATIENT_ID, specialistId: SPECIALIST_A, status: 'active' },
    ]);
    const service = buildService();
    const visible = await service.assertPatientVisibleToActor({
      patientUserId: PATIENT_ID,
      organizationId: ORG_A,
      actor: actor(),
    });
    expect(visible).toBe(true);
  });

  it('bare doctor cannot see a patient linked only to a different specialist in the same org', async () => {
    resetInMemoryPatientVisibilityLinksForTests([
      { organizationId: ORG_A, patientUserId: PATIENT_ID, specialistId: SPECIALIST_OTHER, status: 'active' },
    ]);
    const service = buildService();
    const visible = await service.assertPatientVisibleToActor({
      patientUserId: PATIENT_ID,
      organizationId: ORG_A,
      actor: actor(),
    });
    expect(visible).toBe(false);
  });

  it('an ended link does not grant visibility', async () => {
    resetInMemoryPatientVisibilityLinksForTests([
      { organizationId: ORG_A, patientUserId: PATIENT_ID, specialistId: SPECIALIST_A, status: 'ended' },
    ]);
    const service = buildService();
    const visible = await service.assertPatientVisibleToActor({
      patientUserId: PATIENT_ID,
      organizationId: ORG_A,
      actor: actor(),
    });
    expect(visible).toBe(false);
  });

  it('an actor without a bound specialist (e.g. assistant) sees nothing, even with active links for others in the org', async () => {
    resetInMemoryPatientVisibilityLinksForTests([
      { organizationId: ORG_A, patientUserId: OTHER_PATIENT_ID, specialistId: SPECIALIST_A, status: 'active' },
    ]);
    const service = buildService();
    const visible = await service.assertPatientVisibleToActor({
      patientUserId: PATIENT_ID,
      organizationId: ORG_A,
      actor: actor({ membershipRole: 'assistant', specialistId: null, canManageAllSpecialists: false }),
    });
    expect(visible).toBe(false);
  });

  it('tenant wall: a link that belongs to another organization does not grant visibility even for the same patient/specialist ids', async () => {
    resetInMemoryPatientVisibilityLinksForTests([
      { organizationId: ORG_B, patientUserId: PATIENT_ID, specialistId: SPECIALIST_A, status: 'active' },
    ]);
    const service = buildService();
    const visible = await service.assertPatientVisibleToActor({
      patientUserId: PATIENT_ID,
      organizationId: ORG_A,
      actor: actor(),
    });
    expect(visible).toBe(false);
  });
});

describe('buildPatientVisibilityPredicate', () => {
  const base = { sql: 'SELECT 1 FROM platform_users pu WHERE pu.role = $1', params: ['client'] };

  it('manager/admin (canManageAllSpecialists) gets the input back unchanged — org-wide, no narrowing', () => {
    const result = buildPatientVisibilityPredicate(
      base,
      'pu.id',
      ORG_A,
      actor({ membershipRole: 'owner', canManageAllSpecialists: true, specialistId: null }),
    );
    expect(result).toEqual(base);
  });

  it('an actor without a bound specialist is excluded entirely — not left org-wide by default', () => {
    const result = buildPatientVisibilityPredicate(
      base,
      'pu.id',
      ORG_A,
      actor({ membershipRole: 'assistant', specialistId: null, canManageAllSpecialists: false }),
    );
    expect(result.params).toEqual(base.params);
    expect(result.sql).not.toEqual(base.sql);
  });

  it('a narrow actor appends an org+specialist scoped EXISTS against patient_specialist_links, with params grown by exactly [organizationId, specialistId] in that order', () => {
    const result = buildPatientVisibilityPredicate(base, 'pu.id', ORG_A, actor());
    expect(result.params).toEqual([...base.params, ORG_A, SPECIALIST_A]);
    expect(result.sql).toContain('patient_specialist_links');
    expect(result.sql.startsWith(base.sql)).toBe(true);
  });
});
