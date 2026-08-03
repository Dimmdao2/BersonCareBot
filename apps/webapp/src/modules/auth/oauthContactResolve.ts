import type { OAuthUserResolvePort } from '@/modules/auth/oauthUserResolvePort';

/**
 * IDENTITY_AND_MERGE_SCHEME.md §2a (owner, 03.08) — the six OAuth contact-resolution cases,
 * shared by every OAuth resolver (`oauthWebLoginResolve.ts` for google/apple,
 * `oauthYandexResolve.ts` for yandex) so the matching rules live in exactly one place instead of
 * being copied into each resolver. Only the "who owns these contacts, and is that a conflict"
 * question lives here — create/bind/confirm orchestration stays in each resolver.
 */
export type OAuthContactOwners =
  /** Case 6: the phone and the email each resolve to an existing account, and they differ. */
  | { kind: 'conflict' }
  /** More than one active account already owns the given email (data anomaly, not a case). */
  | { kind: 'ambiguous' }
  | {
      kind: 'resolved';
      /** The account to sign into, or null when neither contact matched anybody (case 2). */
      userId: string | null;
      phoneOwner: string | null;
      emailOwner: string | null;
    };

export async function resolveOAuthContactOwners(
  db: OAuthUserResolvePort,
  params: { phoneNorm: string | null; emailNorm: string | null },
): Promise<OAuthContactOwners> {
  const { phoneNorm, emailNorm } = params;

  const phoneOwner = phoneNorm ? await db.findCanonicalUserIdByPhone(phoneNorm) : null;

  let emailOwner: string | null = null;
  if (emailNorm) {
    let owners = await db.findUserIdsByVerifiedEmail(emailNorm);
    if (owners.length === 0) owners = await db.findActiveUserIdsByEmail(emailNorm);
    // Third tier (F6 §2a item 7): this exact address may not be the primary at all, only a
    // confirmed OAuth-linked secondary of an existing account (case 3/4/5's own past write).
    if (owners.length === 0) owners = await db.findUserIdsByAnyConfirmedEmail(emailNorm);
    if (owners.length > 1) return { kind: 'ambiguous' };
    emailOwner = owners[0] ?? null;
  }

  // Case 6: both contacts present and confirmed, but on two DIFFERENT existing accounts.
  if (phoneOwner && emailOwner && phoneOwner !== emailOwner) {
    return { kind: 'conflict' };
  }

  return { kind: 'resolved', userId: phoneOwner ?? emailOwner ?? null, phoneOwner, emailOwner };
}

/**
 * F6 case 4 ("email matches, phone differs -> phone added as an additional (spare) contact").
 * Case 3/5 (the mirrored email-side add) needs no separate write: it already happens through the
 * existing `applyVerifiedOAuthEmail` (primary-if-none) + `upsertOAuthBinding` (secondary, always)
 * path every resolver already calls. This only covers the phone side, which has no other writer.
 *
 * Deliberately a no-op when the account already has a DIFFERENT active phone: today's schema
 * allows exactly one active `user_phone_history` row per account (`uq_user_phone_history_user_
 * active`), so a genuine second confirmed phone has no place to live without the identity-storage
 * change the owner is deciding separately (D15a/D15b) — this does not attempt to build one.
 */
export async function addSparePhoneContactIfFree(
  db: OAuthUserResolvePort,
  params: { userId: string; phoneNorm: string | null; phoneOwner: string | null },
): Promise<void> {
  const { userId, phoneNorm, phoneOwner } = params;
  if (!phoneNorm || phoneOwner) return;
  const existingPhone = await db.getActivePhoneForUser(userId);
  if (existingPhone) return;
  await db.addSparePhoneContact(userId, phoneNorm);
}
