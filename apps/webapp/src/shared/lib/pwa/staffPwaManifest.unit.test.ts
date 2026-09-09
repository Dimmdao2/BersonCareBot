import { describe, expect, it } from 'vitest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
import { buildPatientPwaManifest } from './patientPwaManifest';
import { buildStaffPwaManifest } from './staffPwaManifest';

const PATIENT_RESOLVED: ResolvedSurface = {
  surface: 'patient_default',
  publicOrigin: PATIENT_DEFAULT_SURFACE.origin,
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};

const STAFF_RESOLVED: ResolvedSurface = {
  surface: 'staff',
  publicOrigin: STAFF_SURFACE.origin,
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff,
};

describe('installed PWA identity', () => {
  it('keeps the patient installation attached to the patient cabinet', () => {
    expect(buildPatientPwaManifest(PATIENT_RESOLVED)).toMatchObject({
      id: '/app',
      scope: '/app',
      start_url: '/app/patient',
    });
  });

  it('keeps the staff installation separate and attached to the doctor cabinet', () => {
    const patient = buildPatientPwaManifest(PATIENT_RESOLVED);
    const staff = buildStaffPwaManifest(STAFF_RESOLVED);

    expect(staff).toMatchObject({
      id: '/app-staff',
      scope: '/app',
      start_url: '/app/doctor',
    });
    expect(staff.id).not.toBe(patient.id);
  });
});
