import { describe, expect, it } from 'vitest';
import { metadata as legalLayoutMetadata } from '@/app/legal/layout';
import { buildPatientPwaManifest } from './patientPwaManifest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import {
  LEGAL_DOCUMENT_OPERATOR,
  legalDocumentMetadata,
} from '@/config/legalDocumentOperator';
import { staffPwaLayoutMetadata } from './staffPwaLayoutMetadata';
import { buildStaffPwaManifest, STAFF_PWA_MANIFEST_PATH } from './staffPwaManifest';

describe('staff PWA identity', () => {
  it('exposes Therapysto in the installed app and staff document metadata', () => {
    expect(buildStaffPwaManifest()).toMatchObject({
      name: 'Therapysto',
      short_name: 'Therapysto',
    });
    expect(staffPwaLayoutMetadata).toMatchObject({
      title: 'Therapysto',
      appleWebApp: { title: 'Therapysto' },
    });
  });

  it('gives both legal documents one complete platform identity', () => {
    expect(LEGAL_DOCUMENT_OPERATOR.requisites).toEqual({
      legalEntityName: '',
      registeredAddress: '',
      inn: '',
      ogrn: '',
    });
    expect(legalLayoutMetadata).toBe(legalDocumentMetadata);
    expect(legalLayoutMetadata).toMatchObject({
      title: LEGAL_DOCUMENT_OPERATOR.productName,
      manifest: STAFF_PWA_MANIFEST_PATH,
      appleWebApp: { title: LEGAL_DOCUMENT_OPERATOR.productName },
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
    expect(buildPatientPwaManifest()).toMatchObject({
      id: '/app',
      scope: '/app',
      start_url: '/app/patient',
      name: `${PATIENT_DEFAULT_SURFACE.name} — забота о твоём здоровье`,
      short_name: PATIENT_DEFAULT_SURFACE.name,
    });
  });

  it('keeps the staff installation identity separate from the patient one', () => {
    const staff = buildStaffPwaManifest();
    expect(staff).toMatchObject({
      id: '/app-staff',
      scope: '/app',
      start_url: '/app/doctor',
      name: STAFF_SURFACE.name,
      short_name: STAFF_SURFACE.name,
    });
    expect(staff.id).not.toBe(buildPatientPwaManifest().id);
  });
});
