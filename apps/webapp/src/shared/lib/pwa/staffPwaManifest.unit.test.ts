import { describe, expect, it } from 'vitest';
import { metadata as legalLayoutMetadata } from '@/app/legal/layout';
import {
  buildPatientPwaManifest,
  PATIENT_PWA_APPLE_TOUCH,
  PATIENT_PWA_ICON_192,
  PATIENT_PWA_ICON_512,
  PATIENT_PWA_ICON_MASKABLE_512,
} from './patientPwaManifest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import { LEGAL_DOCUMENT_OPERATOR, legalDocumentMetadata } from '@/config/legalDocumentOperator';
import { staffPwaLayoutMetadata } from './staffPwaLayoutMetadata';
import {
  buildStaffPwaManifest,
  STAFF_PWA_APPLE_TOUCH,
  STAFF_PWA_ICON_192,
  STAFF_PWA_ICON_512,
  STAFF_PWA_ICON_MASKABLE_512,
  STAFF_PWA_MANIFEST_PATH,
} from './staffPwaManifest';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  surfaceDisplayName,
  surfaceAccentToken,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
import { surfaceLayoutMetadata } from '@/shared/lib/surface/surfaceLayoutMetadata';

const STAFF_RESOLVED: ResolvedSurface = {
  surface: 'staff',
  publicOrigin: STAFF_SURFACE.origin,
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff,
};

const PATIENT_RESOLVED: ResolvedSurface = {
  surface: 'patient_default',
  publicOrigin: PATIENT_DEFAULT_SURFACE.origin,
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};

const BRANDED_RESOLVED: ResolvedSurface = {
  surface: 'patient_branded',
  publicOrigin: 'https://clinic-a.therapygo.ru',
  organizationId: '11111111-1111-4111-8111-111111111111',
  effectivePatientBrand: {
    effectiveDisplayName: 'Clinic A Plus',
    patientAppName: 'Clinic A Care',
    accentToken: '#7a3cc2',
  },
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
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
    const patient = buildPatientPwaManifest(PATIENT_RESOLVED);
    expect(PATIENT_DEFAULT_SURFACE.name).toBe('Therapy Go');
    expect(patient).toMatchObject({
      id: '/app',
      scope: '/app',
      start_url: '/app/patient',
      name: 'Therapy Go — забота о твоём здоровье',
      short_name: 'Therapy Go',
    });
    expect(patient.icons).toEqual([
      { src: PATIENT_PWA_ICON_192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: PATIENT_PWA_ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: PATIENT_PWA_ICON_MASKABLE_512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
    expect(JSON.stringify(surfaceLayoutMetadata(PATIENT_RESOLVED))).toContain(PATIENT_PWA_APPLE_TOUCH);
  });

  it('uses the branded Host resolve for the patient manifest identity', () => {
    expect(buildPatientPwaManifest(BRANDED_RESOLVED)).toMatchObject({
      name: 'Clinic A Care — забота о твоём здоровье',
      short_name: 'Clinic A Care',
      start_url: '/app/patient',
    });
    expect(surfaceLayoutMetadata(BRANDED_RESOLVED)).toMatchObject({
      title: 'Clinic A Care',
      manifest: '/manifest.webmanifest',
      appleWebApp: { title: 'Clinic A Care' },
    });
    const brandedMetadata = JSON.stringify(surfaceLayoutMetadata(BRANDED_RESOLVED));
    expect(brandedMetadata).toContain('/pwa-icon-192.png');
    expect(brandedMetadata).toContain('/apple-touch-icon.png');
    expect(brandedMetadata).not.toContain(PATIENT_PWA_ICON_192);
    expect(surfaceAccentToken(BRANDED_RESOLVED)).toBe('#7a3cc2');
    expect(surfaceAccentToken(PATIENT_RESOLVED)).toBe('#284da0');
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
    expect(staff.icons).toEqual([
      { src: STAFF_PWA_ICON_192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: STAFF_PWA_ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: STAFF_PWA_ICON_MASKABLE_512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
    expect(JSON.stringify(staffPwaLayoutMetadata)).toContain(STAFF_PWA_APPLE_TOUCH);
    expect(JSON.stringify(staff)).not.toContain(PATIENT_PWA_ICON_192);
  });
});

/**
 * `TPB-08`: брендинг клиники влияет ТОЛЬКО на пациентскую поверхность. До этого блока обе
 * staff-проверки выше читали константу `staffPwaLayoutMetadata` напрямую, поэтому подмена ветки
 * в самом `surfaceLayoutMetadata`/`surfaceDisplayName` (staff уходит в пациентскую идентичность
 * или подхватывает бренд арендатора) оставалась зелёной. Здесь спрашиваем именно резолвер.
 */
describe('TPB-08: бренд арендатора не пересекает границу поверхности', () => {
  const PLATFORM_ADMIN_RESOLVED: ResolvedSurface = {
    surface: 'platform_admin',
    publicOrigin: STAFF_SURFACE.origin,
    authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.platform_admin,
  };

  /** Брендированный арендатор «дотянулся» до staff-запроса — имя обязано остаться платформенным. */
  const STAFF_WITH_TENANT_BRAND: ResolvedSurface = {
    ...STAFF_RESOLVED,
    organizationId: BRANDED_RESOLVED.organizationId,
    effectivePatientBrand: BRANDED_RESOLVED.effectivePatientBrand,
  };

  it.each([
    ['staff', STAFF_RESOLVED],
    ['staff с брендом арендатора в запросе', STAFF_WITH_TENANT_BRAND],
  ])('%s видит Therapysto в метаданных документа и в имени поверхности', (_label, resolved) => {
    expect(surfaceDisplayName(resolved)).toBe(STAFF_SURFACE.name);
    expect(surfaceLayoutMetadata(resolved)).toMatchObject({
      title: STAFF_SURFACE.name,
      manifest: STAFF_PWA_MANIFEST_PATH,
      appleWebApp: { title: STAFF_SURFACE.name },
    });
    const serialized = JSON.stringify(surfaceLayoutMetadata(resolved));
    expect(serialized).not.toContain(PATIENT_DEFAULT_SURFACE.name);
    expect(serialized).not.toContain('Clinic A Care');
  });

  it('removes every patient/staff PWA declaration from platform-admin metadata', () => {
    expect(surfaceDisplayName(PLATFORM_ADMIN_RESOLVED)).toBe(STAFF_SURFACE.name);
    expect(surfaceLayoutMetadata(PLATFORM_ADMIN_RESOLVED)).toMatchObject({
      title: STAFF_SURFACE.name,
      manifest: null,
      appleWebApp: null,
      icons: null,
    });
  });

  it('пациентские поверхности при этом НЕ показывают имя staff-платформы', () => {
    for (const resolved of [PATIENT_RESOLVED, BRANDED_RESOLVED]) {
      expect(JSON.stringify(surfaceLayoutMetadata(resolved))).not.toContain(STAFF_SURFACE.name);
    }
  });
});
