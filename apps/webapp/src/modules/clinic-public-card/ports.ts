/**
 * Public clinic card `/{clinic}` — owner ruling 19.08: «надо сделать публичную страницу для клиник
 * уже (не записи а просто их визитку с описанием) и в кабинете админа клиники настройку что на ней
 * писать», plus «Логотип и фотографии на визитке — сейчас».
 *
 * Read model is the public projection and nothing else (plan §3.1): one row of
 * `clinic_public_directory_entries`, reached through a declared root because the bootstrap role
 * holds no privilege on that table at all. No tenant table is on the anonymous path.
 */

/** One ready image of the card. Delivery facts never reach the browser — only the id does. */
export type ClinicPublicCardMedia = {
  id: string;
  role: 'logo' | 'photo';
  mimeType: string;
  s3Key: string | null;
  storedPath: string | null;
};

export type ClinicPublicCardLocation = {
  title: string;
  cityCode: string | null;
  address: string | null;
};

export type ClinicPublicCard = {
  requestedSlug: string;
  canonicalSlug: string;
  /** `redirect` when the visitor arrived through a retired slug that stays valid forever. */
  disposition: 'current' | 'redirect';
  displayName: string;
  description: string | null;
  publicContactPhone: string | null;
  publicContactEmail: string | null;
  publicWebsiteUrl: string | null;
  locations: ClinicPublicCardLocation[];
  media: ClinicPublicCardMedia[];
};

/** Clinic-admin editing state. Read directly under the staff principal (org-scoped by RLS). */
export type ClinicPublicCardSettings = {
  description: string | null;
  publicContactPhone: string | null;
  publicContactEmail: string | null;
  publicWebsiteUrl: string | null;
  logoMediaId: string | null;
  photoMediaIds: string[];
  cardIsPublished: boolean;
};

export type SaveClinicPublicCardInput = ClinicPublicCardSettings & {
  organizationId: string;
};

export type ClinicPublicCardPort = {
  /**
   * Anonymous read. `null` means «no card here» for every reason at once — unknown slug,
   * unpublished directory entry, inactive organization, owner switched the page off. A failure to
   * READ (privilege denied, database down) THROWS instead, because a blank card in place of a
   * refusal is the silence this repository keeps clearing (plan §3.3).
   */
  readPublicCard(slug: string): Promise<ClinicPublicCard | null>;
  /** Clinic-admin read of its own card. */
  readCardSettings(organizationId: string): Promise<ClinicPublicCardSettings | null>;
  /** Clinic-admin write through the declared root; the staff role cannot write these columns. */
  saveCard(input: SaveClinicPublicCardInput): Promise<ClinicPublicCardSettings>;
};

export const CLINIC_PUBLIC_CARD_LIMITS = {
  descriptionMaxLength: 4000,
  phoneMaxLength: 64,
  emailMaxLength: 320,
  websiteMaxLength: 512,
  maxPhotos: 12,
} as const;
