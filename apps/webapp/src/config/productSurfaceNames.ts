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
 *   it adds origin and applies the env override. Client components that only need the display
 *   string import this file directly instead of duplicating the literal.
 */
export const STAFF_SURFACE_NAME = 'Therapysto';
export const PATIENT_DEFAULT_SURFACE_NAME = 'Therapygo';
