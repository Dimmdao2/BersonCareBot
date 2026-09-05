/**
 * Thin re-export shim — NOT an independent authority.
 *
 * The executable function census (`BUSINESS_SEAM_FUNCTIONS` and its companions) physically lives
 * in `declaration.ts` (SECTION -1) since the #1069 correction, alongside the clinical relation
 * access inventory it used to be split from. See `relation-access.ts`'s header for why the split
 * was a defect, not a convenience.
 *
 * This file exists only so existing import paths (tests, cross-census scripts) keep resolving.
 * Edit `declaration.ts`, not this file.
 */
export {
  BUSINESS_SEAM_FUNCTIONS,
  BUSINESS_SEAM_STATS,
  LEGACY_DEFINER_CENSUS_COUNT,
  OBSOLETE_CONTEXT_SIGNATURES,
} from './declaration.ts';
