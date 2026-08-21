import { sql } from 'drizzle-orm';
import { mergeLogger as logger } from './mergeLogger.js';
import type { ManualMergeResolution } from './manualMergeResolution.js';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';
import { runMergeSql } from './mergeSql.js';
import {
  normalizeSupplementaryContactEmail,
  normalizeSupplementaryContactPhone,
} from './supplementaryContactNormalize.js';

export type MergeContactFallbackCandidate = {
  contactType: 'phone' | 'email';
  value: string;
  valueNormalized: string;
};

export type MergeContactsSaved = {
  contactType: 'phone' | 'email';
  valueNormalized: string;
};

type MergePartyContactFields = {
  phone_normalized: string | null;
  email: string | null;
};

function normalizeEmailForContacts(email: string | null | undefined): string | null {
  return normalizeSupplementaryContactEmail(email);
}

function normalizePhoneForContacts(phone: string | null | undefined): string | null {
  return normalizeSupplementaryContactPhone(phone);
}

function pickIdentityPhoneRaw(
  target: MergePartyContactFields,
  duplicate: MergePartyContactFields,
  manualResolution?: ManualMergeResolution | null,
): string | null {
  if (manualResolution) {
    return manualResolution.fields.phone_normalized === 'target'
      ? target.phone_normalized
      : duplicate.phone_normalized;
  }
  return target.phone_normalized != null ? target.phone_normalized : duplicate.phone_normalized;
}

function pickIdentityEmailRaw(
  target: MergePartyContactFields,
  duplicate: MergePartyContactFields,
  manualResolution?: ManualMergeResolution | null,
): string | null {
  if (manualResolution) {
    return manualResolution.fields.email === 'target' ? target.email : duplicate.email;
  }
  return target.email != null ? target.email : duplicate.email;
}

function resolveIdentityPhone(
  target: MergePartyContactFields,
  duplicate: MergePartyContactFields,
  manualResolution?: ManualMergeResolution | null,
): string | null {
  return normalizePhoneForContacts(pickIdentityPhoneRaw(target, duplicate, manualResolution));
}

function resolveIdentityEmailNormalized(
  target: MergePartyContactFields,
  duplicate: MergePartyContactFields,
  manualResolution?: ManualMergeResolution | null,
): string | null {
  return normalizeEmailForContacts(pickIdentityEmailRaw(target, duplicate, manualResolution));
}

/** Non-identity phones/emails from merge parties that should be preserved as doctor-facing contacts. */
export function collectMergeLosingContacts(
  target: MergePartyContactFields,
  duplicate: MergePartyContactFields,
  manualResolution?: ManualMergeResolution | null,
): MergeContactFallbackCandidate[] {
  const identityPhone = resolveIdentityPhone(target, duplicate, manualResolution);
  const identityEmail = resolveIdentityEmailNormalized(target, duplicate, manualResolution);
  const out: MergeContactFallbackCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: MergeContactFallbackCandidate) => {
    const key = `${candidate.contactType}:${candidate.valueNormalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  for (const row of [target, duplicate]) {
    const phone = normalizePhoneForContacts(row.phone_normalized);
    if (phone && phone !== identityPhone) {
      pushCandidate({ contactType: 'phone', value: phone, valueNormalized: phone });
    }
  }

  for (const row of [target, duplicate]) {
    const normalized = normalizeEmailForContacts(row.email);
    if (normalized && normalized !== identityEmail) {
      pushCandidate({
        contactType: 'email',
        value: row.email!.trim(),
        valueNormalized: normalized,
      });
    }
  }

  return out;
}

export async function repointPlatformUserContactsForMerge(
  client: PlatformMergeDbClient,
  targetId: string,
  duplicateId: string,
): Promise<void> {
  try {
    await runMergeSql(
      client,
      sql`INSERT INTO platform_user_contacts (
         platform_user_id, contact_type, value, value_normalized, source, created_at, updated_at
       )
       SELECT ${targetId}::uuid, contact_type, value, value_normalized, source, created_at, updated_at
       FROM platform_user_contacts
       WHERE platform_user_id = ${duplicateId}::uuid
       ON CONFLICT (platform_user_id, contact_type, value_normalized) DO UPDATE SET
         value = EXCLUDED.value,
         source = EXCLUDED.source,
         updated_at = GREATEST(platform_user_contacts.updated_at, EXCLUDED.updated_at)`,
    );
    await runMergeSql(
      client,
      sql`DELETE FROM platform_user_contacts WHERE platform_user_id = ${duplicateId}::uuid`,
    );
  } catch (err) {
    logger.info(
      {
        err,
        targetId,
        duplicateId,
        scope: 'platform_merge',
        event: 'platform_user_contacts_repoint_failed',
      },
      '[merge] platform_user_contacts repoint failed (best-effort)',
    );
  }
}

export async function persistMergeLosingContacts(
  client: PlatformMergeDbClient,
  targetId: string,
  candidates: MergeContactFallbackCandidate[],
): Promise<MergeContactsSaved[]> {
  const saved: MergeContactsSaved[] = [];
  for (const candidate of candidates) {
    try {
      await runMergeSql(
        client,
        sql`INSERT INTO platform_user_contacts (
           platform_user_id, contact_type, value, value_normalized, source, created_at, updated_at
         ) VALUES (${targetId}::uuid, ${candidate.contactType}::text, ${candidate.value}::text, ${candidate.valueNormalized}::text, 'merge', now(), now())
         ON CONFLICT (platform_user_id, contact_type, value_normalized) DO UPDATE SET
           value = EXCLUDED.value,
           source = 'merge',
           updated_at = now()`,
      );
      saved.push({
        contactType: candidate.contactType,
        valueNormalized: candidate.valueNormalized,
      });
    } catch (err) {
      logger.info(
        {
          err,
          targetId,
          candidate,
          scope: 'platform_merge',
          event: 'platform_user_contacts_merge_fallback_failed',
        },
        '[merge] platform_user_contacts merge fallback upsert failed (best-effort)',
      );
    }
  }
  return saved;
}

/** Remove supplementary contacts that duplicate identity phone/email on the canonical user. */
export async function pruneIdentityPlatformUserContactsAfterMerge(
  client: PlatformMergeDbClient,
  targetId: string,
): Promise<void> {
  try {
    await runMergeSql(
      client,
      sql`DELETE FROM platform_user_contacts AS p
       WHERE p.platform_user_id = ${targetId}::uuid
         AND (
           (
             p.contact_type IN ('phone', 'whatsapp')
             AND EXISTS (
               SELECT 1 FROM user_contacts uc WHERE uc.platform_user_id = ${targetId}::uuid
                 AND uc.contact_kind = 'phone' AND uc.value_normalized = p.value_normalized
             )
           )
           OR (
             p.contact_type = 'email'
             AND EXISTS (
               SELECT 1 FROM user_contacts uc WHERE uc.platform_user_id = ${targetId}::uuid
                 AND uc.contact_kind = 'email' AND uc.value_normalized = p.value_normalized
             )
           )
         )`,
    );
  } catch (err) {
    logger.info(
      { err, targetId, scope: 'platform_merge', event: 'platform_user_contacts_prune_failed' },
      '[merge] platform_user_contacts identity prune failed (best-effort)',
    );
  }
}
