/**
 * Literal default display names for product surfaces — the ONE place these strings are spelled
 * out in source (TPB-01, TPB-03, TPB-09, TPB-16).
 *
 * No env read, no side effects: safe to import from both server code and `'use client'`
 * components, unlike `config/env.ts` / `config/productSurfaces.ts` (those pull in server-only
 * startup validation and must not reach the client bundle).
 *
 * - `config/env.ts` uses `PATIENT_DEFAULT_SURFACE_NAME` as the default for the env-overridable
 *   `PATIENT_APP_NAME`.
 * - `config/productSurfaces.ts` is what server code (metadata, manifest, RSC) should import —
 *   it adds origin and applies the env override.
 * - `STAFF_SURFACE_NAME` has no env override (owner-fixed, TPB-01) — `'use client'` components
 *   that only need the staff display string import this file directly.
 * - `PATIENT_DEFAULT_SURFACE_NAME` IS env-overridable server-side (`PATIENT_APP_NAME`, TPB-09).
 *   `'use client'` components must NOT import it directly for display — that would show the
 *   build-time literal instead of the deploy-config value. Use
 *   `usePatientSurfaceName()`/`PatientSurfaceNameContext` from `@/shared/ui/PlatformProvider`
 *   instead, which threads the server-resolved `PATIENT_DEFAULT_SURFACE.name` down from
 *   `RootLayout`. This literal remains the context's no-provider fallback and `env.ts`'s default.
 */
export const STAFF_SURFACE_NAME = 'Therapysto';
export const PATIENT_DEFAULT_SURFACE_NAME = 'Therapygo';
