import { describe, expect, it } from 'vitest';
import { mailProfileForResolvedSurface } from '@/modules/auth/mailProfile';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';

/**
 * §1.2f (владелец, 23.08.2026): «Два: Therapysto персоналу, Therapygo пациентам».
 * Имя приходит ПАРАМЕТРОМ от вызывающего, и решает его поверхность запроса — поэтому каждая
 * из четырёх поверхностей фиксируется здесь отдельно. Без staff-случая ветка персонала
 * не защищена ничем: `/api/auth/email-otp/start` роли не ограничивает, а политика staff
 * включает вход кодом на почту (находка аудита `S-1`, 24.08.2026).
 */
const surfaceOf = (patch: Partial<ResolvedSurface>): ResolvedSurface =>
  ({
    surface: 'staff',
    publicOrigin: 'https://example.test',
    authPolicy: { availableMethods: [], enabledMethods: [] },
    ...patch,
  }) as ResolvedSurface;

describe('mailProfileForResolvedSurface: имя отправителя следует за поверхностью', () => {
  it('персонал получает имя платформы, а не пациентского приложения', () => {
    const profile = mailProfileForResolvedSurface(surfaceOf({ surface: 'staff' }));
    expect(profile).toEqual({ kind: 'platform', senderDisplayName: STAFF_SURFACE.name });
    expect(profile).not.toEqual({
      kind: 'platform',
      senderDisplayName: PATIENT_DEFAULT_SURFACE.name,
    });
  });

  it('платформенный админ получает то же имя платформы', () => {
    expect(mailProfileForResolvedSurface(surfaceOf({ surface: 'platform_admin' }))).toEqual({
      kind: 'platform',
      senderDisplayName: STAFF_SURFACE.name,
    });
  });

  it('пациент общего входа получает имя пациентского приложения', () => {
    expect(mailProfileForResolvedSurface(surfaceOf({ surface: 'patient_default' }))).toEqual({
      kind: 'platform',
      senderDisplayName: PATIENT_DEFAULT_SURFACE.name,
    });
  });

  it('пациент клиники получает имя клиники рядом с именем пациентского приложения', () => {
    const profile = mailProfileForResolvedSurface(
      surfaceOf({
        surface: 'patient_branded',
        organizationId: 'org-1',
        effectivePatientBrand: { effectiveDisplayName: 'Реацентр «Пульс»' },
      } as Partial<ResolvedSurface>),
    );
    expect(profile).toEqual({
      kind: 'branded',
      organizationId: 'org-1',
      clinicName: 'Реацентр «Пульс»',
      platformName: PATIENT_DEFAULT_SURFACE.name,
    });
  });

  it('брендированная поверхность без бренда — ошибка вызова, а не подстановка имени', () => {
    expect(() =>
      mailProfileForResolvedSurface(surfaceOf({ surface: 'patient_branded' })),
    ).toThrowError('branded_surface_mail_profile_required');
  });
});
