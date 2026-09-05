/**
 * Thin re-export shim — NOT an independent authority.
 *
 * The manually-authored clinical relation access inventory (`REV10_CLINICAL_ACCESS`) physically
 * lives in `declaration.ts` (SECTION -1) since the #1069 correction: it used to be edited here
 * while `declaration.ts` edited a second, parallel map (`REV10_SYSTEM_DIRECT_ACCESS`) for the same
 * relations, and the two were unioned at generation time instead of cross-checked — the SaaS
 * billing-period ship (#1069) updated one and not the other, and nothing failed closed.
 *
 * This file exists only so existing import paths (production comments, tests) keep resolving.
 * Edit `declaration.ts`, not this file.
 */
export type { Revision10ClinicalAccess, Revision10DirectGrant } from './declaration.ts';
export { REV10_CLINICAL_ACCESS } from './declaration.ts';
