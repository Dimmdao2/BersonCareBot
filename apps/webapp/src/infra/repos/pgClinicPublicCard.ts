import { and, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  ClinicPublicCard,
  ClinicPublicCardLocation,
  ClinicPublicCardMedia,
  ClinicPublicCardPort,
  ClinicPublicCardSettings,
} from '@/modules/clinic-public-card/ports';
import { clinicPublicDirectoryEntries } from '../../../db/schema';

type CardRow = {
  requestedSlug?: unknown;
  canonicalSlug?: unknown;
  disposition?: unknown;
  displayName?: unknown;
  description?: unknown;
  publicContactPhone?: unknown;
  publicContactEmail?: unknown;
  publicWebsiteUrl?: unknown;
  locations?: unknown;
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

function mapMedia(value: unknown): ClinicPublicCardMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const id = text(row.id);
    const mimeType = text(row.mimeType);
    const role = row.role === 'logo' ? 'logo' : row.role === 'photo' ? 'photo' : null;
    if (!id || !mimeType || !role) return [];
    return [{ id, role, mimeType, s3Key: text(row.s3Key), storedPath: text(row.storedPath) }];
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
        displayName,
        description: text(card.description),
        publicContactPhone: text(card.publicContactPhone),
        publicContactEmail: text(card.publicContactEmail),
        publicWebsiteUrl: text(card.publicWebsiteUrl),
        locations: mapLocations(card.locations),
        media: mapMedia(card.media),
      };
    },

    async readCardSettings(organizationId): Promise<ClinicPublicCardSettings | null> {
      const [row] = await getDrizzle()
        .select({
          description: clinicPublicDirectoryEntries.description,
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
        publicContactPhone: row.publicContactPhone ?? null,
        publicContactEmail: row.publicContactEmail ?? null,
        publicWebsiteUrl: row.publicWebsiteUrl ?? null,
        logoMediaId: row.logoMediaId ?? null,
        photoMediaIds: Array.isArray(row.photoMediaIds) ? row.photoMediaIds : [],
        cardIsPublished: row.cardIsPublished === true,
      };
    },

    async saveCard(input): Promise<ClinicPublicCardSettings> {
      // `uuid[]` has no canonical port-argument representation, so the ordered photo list travels
      // as its JSON text — the same shape the analytics root uses for its audience list.
      const photosJson = JSON.stringify(input.photoMediaIds);
      await runWebappNamedRoot<{ saved: unknown }>(
        getWebappSqlDb(),
        'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean)',
        [
          input.organizationId,
          input.description,
          input.publicContactPhone,
          input.publicContactEmail,
          input.publicWebsiteUrl,
          input.logoMediaId,
          photosJson,
          input.cardIsPublished,
        ],
        sql`SELECT app.save_public_clinic_card(
          ${input.organizationId}::uuid,
          ${input.description}::text,
          ${input.publicContactPhone}::text,
          ${input.publicContactEmail}::text,
          ${input.publicWebsiteUrl}::text,
          ${input.logoMediaId}::uuid,
          ${photosJson}::text,
          ${input.cardIsPublished}::boolean
        ) AS saved`,
      );
      return {
        description: input.description,
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
