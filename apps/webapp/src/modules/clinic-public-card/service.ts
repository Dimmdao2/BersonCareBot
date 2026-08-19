import {
  CLINIC_PUBLIC_CARD_LIMITS,
  type ClinicPublicCard,
  type ClinicPublicCardMedia,
  type ClinicPublicCardPort,
  type ClinicPublicCardSettings,
  type SaveClinicPublicCardInput,
} from './ports';

export type ClinicPublicCardService = {
  readPublicCard(slug: string): Promise<ClinicPublicCard | null>;
  /**
   * The ONE place that decides whether an anonymous request may receive a given media id: the id
   * has to be inside the set the card itself returned. A foreign uuid therefore fails by
   * construction — there is no lookup to widen, and the shared `/api/media/{uuid}` chokepoint is
   * untouched (plan §3.5).
   */
  resolvePublicCardMedia(slug: string, mediaId: string): Promise<ClinicPublicCardMedia | null>;
  readCardSettings(organizationId: string): Promise<ClinicPublicCardSettings | null>;
  saveCard(input: SaveClinicPublicCardInput): Promise<SaveClinicPublicCardResult>;
};

export type SaveClinicPublicCardResult =
  | { ok: true; settings: ClinicPublicCardSettings }
  | { ok: false; code: ClinicPublicCardValidationCode };

export type ClinicPublicCardValidationCode =
  | 'description_too_long'
  | 'phone_too_long'
  | 'email_too_long'
  | 'website_too_long'
  | 'website_invalid'
  | 'too_many_photos'
  | 'duplicate_photo';

const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePublicWebsiteUrl(raw: string | null): string | null | 'invalid' {
  if (raw === null) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return 'invalid';
  }
  // Only the two schemes a browser can follow from a public page. `javascript:`/`data:` would be
  // an injected link on a page anyone can open, so they never become a stored value.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'invalid';
  if (!parsed.hostname.includes('.')) return 'invalid';
  return parsed.toString();
}

export function createClinicPublicCardService(
  port: ClinicPublicCardPort,
): ClinicPublicCardService {
  async function readPublicCard(slugRaw: string): Promise<ClinicPublicCard | null> {
    const slug = slugRaw.trim().toLowerCase();
    // Malformed input is refused before the chokepoint and still fail-closed, so a visitor cannot
    // tell a bad slug from an unknown clinic.
    if (!SLUG_PATTERN.test(slug)) return null;
    return port.readPublicCard(slug);
  }

  return {
    readPublicCard,

    async resolvePublicCardMedia(slug, mediaId) {
      if (!UUID_PATTERN.test(mediaId)) return null;
      const card = await readPublicCard(slug);
      if (!card) return null;
      return card.media.find((item) => item.id.toLowerCase() === mediaId.toLowerCase()) ?? null;
    },

    async readCardSettings(organizationId) {
      return port.readCardSettings(organizationId);
    },

    async saveCard(input) {
      const description = trimmedOrNull(input.description);
      const phone = trimmedOrNull(input.publicContactPhone);
      const email = trimmedOrNull(input.publicContactEmail);
      const websiteRaw = trimmedOrNull(input.publicWebsiteUrl);

      if (description && description.length > CLINIC_PUBLIC_CARD_LIMITS.descriptionMaxLength) {
        return { ok: false, code: 'description_too_long' };
      }
      if (phone && phone.length > CLINIC_PUBLIC_CARD_LIMITS.phoneMaxLength) {
        return { ok: false, code: 'phone_too_long' };
      }
      if (email && email.length > CLINIC_PUBLIC_CARD_LIMITS.emailMaxLength) {
        return { ok: false, code: 'email_too_long' };
      }
      const website = normalizePublicWebsiteUrl(websiteRaw);
      if (website === 'invalid') return { ok: false, code: 'website_invalid' };
      if (website && website.length > CLINIC_PUBLIC_CARD_LIMITS.websiteMaxLength) {
        return { ok: false, code: 'website_too_long' };
      }

      const photoMediaIds = input.photoMediaIds.filter((id) => UUID_PATTERN.test(id));
      if (photoMediaIds.length > CLINIC_PUBLIC_CARD_LIMITS.maxPhotos) {
        return { ok: false, code: 'too_many_photos' };
      }
      if (new Set(photoMediaIds.map((id) => id.toLowerCase())).size !== photoMediaIds.length) {
        return { ok: false, code: 'duplicate_photo' };
      }

      const settings = await port.saveCard({
        organizationId: input.organizationId,
        description,
        publicContactPhone: phone,
        publicContactEmail: email,
        publicWebsiteUrl: website,
        logoMediaId:
          input.logoMediaId && UUID_PATTERN.test(input.logoMediaId) ? input.logoMediaId : null,
        photoMediaIds,
        cardIsPublished: input.cardIsPublished === true,
      });
      return { ok: true, settings };
    },
  };
}
