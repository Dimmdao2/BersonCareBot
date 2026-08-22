import { describe, expect, it } from 'vitest';
import { buildPatientPwaManifest } from './patientPwaManifest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import { staffPwaLayoutMetadata } from './staffPwaLayoutMetadata';
import { buildStaffPwaManifest } from './staffPwaManifest';
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';

const STAFF_RESOLVED: ResolvedSurface = {
  surface: 'staff',
  publicOrigin: STAFF_SURFACE.origin,
  authPolicy: 'staff',
};

const PATIENT_RESOLVED: ResolvedSurface = {
  surface: 'patient_default',
  publicOrigin: PATIENT_DEFAULT_SURFACE.origin,
  authPolicy: 'patient',
};

const BRANDED_RESOLVED: ResolvedSurface = {
  surface: 'patient_branded',
  publicOrigin: 'https://clinic-a.therapygo.ru',
  organizationId: '11111111-1111-4111-8111-111111111111',
  effectivePatientBrand: {
    organizationId: '11111111-1111-4111-8111-111111111111',
    core: { displayName: 'Clinic A', isActive: true },
    paid: { displayName: 'Clinic A Plus', logoUrl: null },
    effectiveDisplayName: 'Clinic A Plus',
    resolution: 'applied',
  },
  authPolicy: 'patient',
};

describe('staff PWA identity', () => {
  it('exposes Therapysto in the installed app and staff document metadata', () => {
    expect(buildStaffPwaManifest(STAFF_RESOLVED)).toMatchObject({
      name: 'Therapysto',
      short_name: 'Therapysto',
    });
    expect(staffPwaLayoutMetadata).toMatchObject({
      title: 'Therapysto',
      appleWebApp: { title: 'Therapysto' },
    });
  });
});

/**
 * `id`/`scope`/`start_url` — контракт УЖЕ установленного приложения: браузер сопоставляет обновлённый
 * манифест с установленной иконкой по `id`, а `scope`/`start_url` решают, откроется ли она как
 * приложение. Их смена осиротит установку у каждого, кто уже поставил PWA, поэтому переименование
 * поверхности (TPB-01/TPB-03/TPB-15) обязано менять только имена.
 */
describe('installed PWA contract survives the surface rename', () => {
  it('keeps the patient installation identity and only renames it', () => {
    expect(buildPatientPwaManifest(PATIENT_RESOLVED)).toMatchObject({
      id: '/app',
      scope: '/app',
      start_url: '/app/patient',
      name: `${PATIENT_DEFAULT_SURFACE.name} — забота о твоём здоровье`,
      short_name: PATIENT_DEFAULT_SURFACE.name,
    });
  });

  it('uses the branded Host resolve for the patient manifest identity', () => {
    expect(buildPatientPwaManifest(BRANDED_RESOLVED)).toMatchObject({
      name: 'Clinic A Plus — забота о твоём здоровье',
      short_name: 'Clinic A Plus',
      start_url: '/app/patient',
    });
  });

  it('keeps the staff installation identity separate from the patient one', () => {
    const staff = buildStaffPwaManifest(STAFF_RESOLVED);
    expect(staff).toMatchObject({
      id: '/app-staff',
      scope: '/app',
      start_url: '/app/doctor',
      name: STAFF_SURFACE.name,
      short_name: STAFF_SURFACE.name,
    });
    expect(staff.id).not.toBe(buildPatientPwaManifest(PATIENT_RESOLVED).id);
  });
});
