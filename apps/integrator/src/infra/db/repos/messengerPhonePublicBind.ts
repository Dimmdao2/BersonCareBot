/**
 * Binding-first messenger phone: update webapp canon (`public.platform_users`) in the same DB/TX as integrator.
 * Uses qualified `public.*` names so behavior does not depend on connection `search_path`.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

export type MessengerPhoneLinkFailureCode =
  | 'no_channel_binding'
  | 'phone_owned_by_other_user'
  | 'integrator_id_mismatch';

export class MessengerPhoneLinkError extends Error {
  readonly code: MessengerPhoneLinkFailureCode | 'db_transient_failure';

  constructor(code: MessengerPhoneLinkFailureCode | 'db_transient_failure', options?: { cause?: unknown }) {
    super(code);
    this.name = 'MessengerPhoneLinkError';
    this.code = code;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Strict binding-first: row must exist in `user_channel_bindings` for (channelCode, externalId).
 * Sets phone + trust + integrator_user_id (COALESCE) on the bound canonical `platform_users` row.
 */
export async function applyMessengerPhonePublicBind(
  db: DbPort,
  input: {
    channelCode: string;
    externalId: string;
    phoneNormalized: string;
    canonicalIntegratorUserId: string;
  },
): Promise<void> {
  const { channelCode, externalId, phoneNormalized, canonicalIntegratorUserId } = input;

  const bindRes = await db.query<{
    platform_user_id: string;
    existing_int_uid: string | null;
  }>(
    `SELECT pu.id::text AS platform_user_id,
            pu.integrator_user_id::text AS existing_int_uid
     FROM public.user_channel_bindings ucb
     INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = $1 AND ucb.external_id = $2
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
    [channelCode, externalId],
  );
  const row = bindRes.rows[0];
  if (!row) {
    throw new MessengerPhoneLinkError('no_channel_binding');
  }

  const platformUserId = row.platform_user_id;

  if (
    row.existing_int_uid !== null &&
    row.existing_int_uid !== undefined &&
    row.existing_int_uid.trim() !== '' &&
    row.existing_int_uid !== canonicalIntegratorUserId
  ) {
    throw new MessengerPhoneLinkError('integrator_id_mismatch');
  }

  const otherPhone = await db.query<{ id: string }>(
    `SELECT id::text FROM public.platform_users
     WHERE phone_normalized = $1 AND merged_into_id IS NULL AND id <> $2::uuid
     LIMIT 1`,
    [phoneNormalized, platformUserId],
  );
  if (otherPhone.rows[0]) {
    throw new MessengerPhoneLinkError('phone_owned_by_other_user');
  }

  const otherInt = await db.query<{ id: string }>(
    `SELECT id::text FROM public.platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL AND id <> $2::uuid
     LIMIT 1`,
    [canonicalIntegratorUserId, platformUserId],
  );
  if (otherInt.rows[0]) {
    throw new MessengerPhoneLinkError('integrator_id_mismatch');
  }

  try {
    const upd = await db.query(
      `UPDATE public.platform_users SET
         phone_normalized = $2,
         patient_phone_trust_at = now(),
         integrator_user_id = COALESCE(integrator_user_id, $3::bigint),
         updated_at = now()
       WHERE id = $1::uuid
         AND merged_into_id IS NULL`,
      [platformUserId, phoneNormalized, canonicalIntegratorUserId],
    );
    if ((upd.rowCount ?? 0) < 1) {
      throw new MessengerPhoneLinkError('db_transient_failure');
    }
  } catch (err) {
    if (err instanceof MessengerPhoneLinkError) throw err;
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      throw new MessengerPhoneLinkError('phone_owned_by_other_user');
    }
    logger.error({ err }, '[messengerPhone] public platform_users UPDATE failed');
    throw new MessengerPhoneLinkError('db_transient_failure', { cause: err });
  }
}
