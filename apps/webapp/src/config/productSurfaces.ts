import { env } from './env';
import { STAFF_SURFACE_NAME } from './productSurfaceNames';

/**
 * Единственный типизированный источник user-visible имени и origin для product-surface'ов вебаппа.
 *
 * `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, этап A
 * (TPB-01, TPB-03, TPB-04, TPB-09, TPB-16). Любое место, которому нужно имя платформы или origin
 * поверхности, импортирует значение отсюда — второй геттер/константу/store не заводить (TPB-16).
 *
 * Branded patient surface строит `RequestSurfaceResolver` по `EffectivePatientBrand`;
 * этот deploy-config модуль её не дублирует.
 */

/** Специалисты, админы клиники, платформенные админы. Имя фиксировано владельцем (TPB-01). */
export const STAFF_SURFACE = {
  name: STAFF_SURFACE_NAME,
  /** Существующий deploy seam (`config/env.ts`) — второй способ задать staff origin не заводим. */
  origin: env.APP_BASE_URL,
} as const;

/** Общий вход пациентов — единственный сегодня patient app, без клиничного бренда. */
export const PATIENT_DEFAULT_SURFACE = {
  name: env.PATIENT_APP_NAME,
  origin: env.PATIENT_APP_ORIGIN,
} as const;

/**
 * Платформенное/юридическое имя оператора сервиса — то же значение, что и `STAFF_SURFACE.name`,
 * не отдельная константа (владелец 22.08.2026, W8: «платформа Therapysto» — отметка на экране
 * входа пациента и общее имя в юридических/consent-документах, разделяемых обеими поверхностями).
 */
export const PLATFORM_NAME: string = STAFF_SURFACE.name;
