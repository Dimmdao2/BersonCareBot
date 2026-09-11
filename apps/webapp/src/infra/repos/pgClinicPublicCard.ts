import { and, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  ClinicPublicCard,
  ClinicPublicCardLocation,
  ClinicPublicCardMedia,
  ClinicPublicCardMediaRole,
  ClinicPublicCardPort,
  ClinicPublicCardServiceItem,
  ClinicPublicCardSettings,
  ClinicPublicCardSpecialist,
} from '@/modules/clinic-public-card/ports';
import {
  beOrganizations,
  clinicPublicDirectoryEntries,
  orgBrandRevisions,
} from '../../../db/schema';

type CardRow = {
  requestedSlug?: unknown;
  canonicalSlug?: unknown;
  disposition?: unknown;
  cardIsPublished?: unknown;
  displayName?: unknown;
  description?: unknown;
  fullDescriptionMarkdown?: unknown;
  publicContactPhone?: unknown;
  publicContactEmail?: unknown;
  publicWebsiteUrl?: unknown;
  locations?: unknown;
  specialists?: unknown;
  services?: unknown;
  media?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapLocations(value: unknown): ClinicPublicCardLocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const title = text(row.title);
    if (!title) return [];
    return [{ title, cityCode: text(row.cityCode), address: text(row.address) }];
  });
}

const MEDIA_ROLES: readonly ClinicPublicCardMediaRole[] = [
  'logo',
  'photo',
  'specialistAvatar',
  'specialistDescription',
  'clinicDescription',
];

function mediaRole(value: unknown): ClinicPublicCardMediaRole | null {
  return MEDIA_ROLES.find((role) => role === value) ?? null;
}

function mapMedia(value: unknown): ClinicPublicCardMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const id = text(row.id);
    const mimeType = text(row.mimeType);
    const role = mediaRole(row.role);
    if (!id || !mimeType || !role) return [];
    return [{ id, role, mimeType, s3Key: text(row.s3Key), storedPath: text(row.storedPath) }];
  });
}

/** Целое неотрицательное или 0: строка без числа не превращается в выдуманную цену/длительность. */
function wholeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function mapServices(value: unknown): ClinicPublicCardServiceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const title = text(row.title);
    if (!title) return [];
    return [
      {
        title,
        description: text(row.description),
        durationMinutes: wholeNumber(row.durationMinutes),
        priceMinor: wholeNumber(row.priceMinor),
      },
    ];
  });
}

function mapSpecialists(value: unknown): ClinicPublicCardSpecialist[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const id = text(row.id);
    const fullName = text(row.fullName);
    if (!id || !fullName) return [];
    return [
      {
        id,
        fullName,
        shortDescription: text(row.shortDescription),
        fullDescriptionMarkdown: text(row.fullDescriptionMarkdown),
        avatarMediaId: text(row.avatarMediaId),
      },
    ];
  });
}

/**
 * Public clinic card repository (plan §3, migration 0049).
 *
 * Both statements are declared roots, for the same reason from opposite ends: the anonymous role
 * has NO privilege at all on `clinic_public_directory_entries` (revoked outright), and the staff
 * role holds column-level `UPDATE` on `slug, updated_at` only. Neither role is widened here — the
 * card is reached through its own door, which is the sanctioned mechanism.
 *
 * The staff-side READ is a plain Drizzle select on purpose: `app_staff` already holds table SELECT
 * on this projection and its RLS policy pins the row to `app.current_org_id()`, so a second door
 * would be a second way to do the same thing.
 */
export function createPgClinicPublicCardPort(): ClinicPublicCardPort {
  return {
    async readPublicCard(slug): Promise<ClinicPublicCard | null> {
      const result = await runWebappNamedRoot<{ card: CardRow | null }>(
        getWebappSqlDb(),
        'app.read_public_clinic_card(text)',
        [slug],
        sql`SELECT app.read_public_clinic_card(${slug}::text) AS card`,
      );
      const card = result.rows[0]?.card ?? null;
      if (!card) return null;
      const canonicalSlug = text(card.canonicalSlug);
      const displayName = text(card.displayName);
      if (!canonicalSlug || !displayName) return null;
      return {
        requestedSlug: text(card.requestedSlug) ?? slug,
        canonicalSlug,
        disposition: card.disposition === 'redirect' ? 'redirect' : 'current',
        // Строго `true`: любое другое значение читается как «страница выключена», то есть в
        // сторону меньшего показа. Ошибка чтения признака не должна раскрывать визитку.
        cardIsPublished: card.cardIsPublished === true,
        displayName,
        description: text(card.description),
        fullDescriptionMarkdown: text(card.fullDescriptionMarkdown),
        publicContactPhone: text(card.publicContactPhone),
        publicContactEmail: text(card.publicContactEmail),
        publicWebsiteUrl: text(card.publicWebsiteUrl),
        locations: mapLocations(card.locations),
        specialists: mapSpecialists(card.specialists),
        services: mapServices(card.services),
        media: mapMedia(card.media),
      };
    },

    async readCardSettings(organizationId): Promise<ClinicPublicCardSettings | null> {
      const [row] = await getDrizzle()
        .select({
          description: clinicPublicDirectoryEntries.description,
          fullDescriptionMarkdown: clinicPublicDirectoryEntries.fullDescriptionMarkdown,
          publicContactPhone: clinicPublicDirectoryEntries.publicContactPhone,
          publicContactEmail: clinicPublicDirectoryEntries.publicContactEmail,
          publicWebsiteUrl: clinicPublicDirectoryEntries.publicWebsiteUrl,
          logoMediaId: clinicPublicDirectoryEntries.logoMediaId,
          photoMediaIds: clinicPublicDirectoryEntries.photoMediaIds,
          cardIsPublished: clinicPublicDirectoryEntries.cardIsPublished,
        })
        .from(clinicPublicDirectoryEntries)
        .where(and(eq(clinicPublicDirectoryEntries.organizationId, organizationId)))
        .limit(1);
      if (!row) return null;
      return {
        description: row.description ?? null,
        fullDescriptionMarkdown: row.fullDescriptionMarkdown ?? null,
        publicContactPhone: row.publicContactPhone ?? null,
        publicContactEmail: row.publicContactEmail ?? null,
        publicWebsiteUrl: row.publicWebsiteUrl ?? null,
        logoMediaId: row.logoMediaId ?? null,
        photoMediaIds: Array.isArray(row.photoMediaIds) ? row.photoMediaIds : [],
        cardIsPublished: row.cardIsPublished === true,
      };
    },

    async readCardIdentity(organizationId) {
      // Имя — то же живое разрешение, что в публичной двери (#926 §17.R): переопределение
      // опубликованного бренда, иначе каноническое имя организации. Копия `display_name` в строке
      // каталога не читается ни здесь, ни там — кабинет обязан показывать ровно то, что увидит
      // посетитель, а не третье значение.
      const [row] = await getDrizzle()
        .select({
          slug: clinicPublicDirectoryEntries.slug,
          brandDisplayName: orgBrandRevisions.displayName,
          organizationTitle: beOrganizations.title,
        })
        .from(clinicPublicDirectoryEntries)
        .innerJoin(
          beOrganizations,
          eq(beOrganizations.id, clinicPublicDirectoryEntries.organizationId),
        )
        .leftJoin(
          orgBrandRevisions,
          and(
            eq(orgBrandRevisions.organizationId, clinicPublicDirectoryEntries.organizationId),
            eq(orgBrandRevisions.status, 'published'),
          ),
        )
        .where(eq(clinicPublicDirectoryEntries.organizationId, organizationId))
        .limit(1);
      if (!row) return null;
      const brandName = row.brandDisplayName?.trim();
      return { slug: row.slug, displayName: brandName || row.organizationTitle };
    },

    async saveCard(input): Promise<ClinicPublicCardSettings> {
      // `uuid[]` has no canonical port-argument representation, so the ordered photo list travels
      // as its JSON text — the same shape the analytics root uses for its audience list.
      const photosJson = JSON.stringify(input.photoMediaIds);
      await runWebappNamedRoot<{ saved: unknown }>(
        getWebappSqlDb(),
        'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean,text)',
        [
          input.organizationId,
          input.description,
          input.publicContactPhone,
          input.publicContactEmail,
          input.publicWebsiteUrl,
          input.logoMediaId,
          photosJson,
          input.cardIsPublished,
          input.fullDescriptionMarkdown,
        ],
        sql`SELECT app.save_public_clinic_card(
          ${input.organizationId}::uuid,
          ${input.description}::text,
          ${input.publicContactPhone}::text,
          ${input.publicContactEmail}::text,
          ${input.publicWebsiteUrl}::text,
          ${input.logoMediaId}::uuid,
          ${photosJson}::text,
          ${input.cardIsPublished}::boolean,
          ${input.fullDescriptionMarkdown}::text
        ) AS saved`,
      );
      return {
        description: input.description,
        fullDescriptionMarkdown: input.fullDescriptionMarkdown,
        publicContactPhone: input.publicContactPhone,
        publicContactEmail: input.publicContactEmail,
        publicWebsiteUrl: input.publicWebsiteUrl,
        logoMediaId: input.logoMediaId,
        photoMediaIds: input.photoMediaIds,
        cardIsPublished: input.cardIsPublished,
      };
    },
  };
}
