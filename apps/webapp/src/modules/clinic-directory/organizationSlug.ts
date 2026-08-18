import { transliterateCyrillic } from '@/shared/lib/cyrillicTransliteration';

const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

/** Top-level application/system routes that can never become organization addresses. */
export const RESERVED_ORGANIZATION_SLUGS = new Set([
  'account',
  'admin',
  'api',
  'app',
  'auth',
  'book',
  'booking',
  'doctor',
  'favicon',
  'health',
  'help',
  'join',
  'legal',
  'login',
  'manage',
  'manifest',
  'patient',
  'privacy',
  'register',
  'robots',
  'settings',
  'sign-in',
  'signup',
  'sitemap',
  'status',
  'support',
  'terms',
  'widget',
  '_next',
]);

export type OrganizationSlugValidation =
  | { ok: true; slug: string }
  | {
      ok: false;
      code: 'slug_invalid_characters' | 'slug_too_short' | 'slug_too_long' | 'reserved_slug';
    };

/**
 * Normalizes an owner-confirmed ASCII candidate. It intentionally does not transliterate or
 * silently discard non-ASCII characters: title-derived transliteration is a suggestion only.
 */
export function validateOrganizationSlugCandidate(raw: string): OrganizationSlugValidation {
  const lowered = raw.normalize('NFKC').trim().toLowerCase();
  if (/[^a-z0-9 _-]/.test(lowered)) {
    return { ok: false, code: 'slug_invalid_characters' };
  }
  const slug = lowered.replace(/[ _-]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length < 3) return { ok: false, code: 'slug_too_short' };
  if (slug.length > 63) return { ok: false, code: 'slug_too_long' };
  if (!ORGANIZATION_SLUG_PATTERN.test(slug)) {
    return { ok: false, code: 'slug_invalid_characters' };
  }
  if (RESERVED_ORGANIZATION_SLUGS.has(slug)) return { ok: false, code: 'reserved_slug' };
  return { ok: true, slug };
}

/** Produces a UI suggestion only; persistence still requires explicit candidate validation. */
export function suggestOrganizationSlug(title: string): string | null {
  const transliterated = transliterateCyrillic(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
  const validation = validateOrganizationSlugCandidate(transliterated);
  return validation.ok ? validation.slug : null;
}
