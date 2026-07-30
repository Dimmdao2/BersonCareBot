import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type {
  PasskeyChallenge,
  PasskeyCredential,
  PasskeyCredentialSummary,
  PasskeyStore,
} from '@/modules/auth/passkeyStore';

const TRANSPORTS = new Set<AuthenticatorTransportFuture>([
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb',
]);

function parseTransports(value: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is AuthenticatorTransportFuture =>
      typeof entry === 'string' && TRANSPORTS.has(entry as AuthenticatorTransportFuture),
  );
}

function parseDeviceType(value: string): CredentialDeviceType {
  return value === 'multiDevice' ? 'multiDevice' : 'singleDevice';
}

export const pgPasskeyStore: PasskeyStore = {
  async getOrCreateUserHandle(userId, candidateHandle) {
    const result = await runWebappPgText<{ user_handle: string | null }>(
      `SELECT app.passkey_get_or_create_account($1::uuid, $2::text) AS user_handle`,
      [userId, candidateHandle],
    );
    const handle = result.rows[0]?.user_handle;
    if (!handle) throw new Error('passkey_account_unavailable');
    return handle;
  },

  async listCredentialExclusions(_userId) {
    const result = await runWebappPgText<{ credential_id: string; transports: unknown }>(
      `SELECT credential_id, transports FROM app.passkey_list_current_exclusions()`,
    );
    return result.rows.map((row) => ({
      credentialId: row.credential_id,
      transports: parseTransports(row.transports),
    }));
  },

  async listCredentials(_userId): Promise<PasskeyCredentialSummary[]> {
    const result = await runWebappPgText<{
      credential_id: string;
      transports: unknown;
      device_type: string;
      backed_up: boolean;
      created_at: string;
      last_used_at: string | null;
    }>(
      `SELECT credential_id, transports, device_type, backed_up, created_at, last_used_at
       FROM app.passkey_list_current_credentials()`,
    );
    return result.rows.map((row) => ({
      credentialId: row.credential_id,
      transports: parseTransports(row.transports),
      deviceType: parseDeviceType(row.device_type),
      backedUp: row.backed_up,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  },

  async issueChallenge(input) {
    const result = await runWebappPgText<{ issued: boolean }>(
      `SELECT app.passkey_issue_challenge(
         $1::uuid,
         $2::text,
         $3::uuid,
         $4::text,
         $5::text,
         $6::text,
         $7::timestamptz
       ) AS issued`,
      [
        input.id,
        input.purpose,
        input.userId,
        input.challenge,
        input.expectedOrigin,
        input.rpId,
        input.expiresAt,
      ],
    );
    return result.rows[0]?.issued === true;
  },

  async readChallenge(id, purpose): Promise<PasskeyChallenge | null> {
    const result = await runWebappPgText<{
      user_id: string | null;
      challenge: string;
      expected_origin: string;
      rp_id: string;
      expires_at: string;
    }>(
      `SELECT user_id::text, challenge, expected_origin, rp_id, expires_at
       FROM app.passkey_read_challenge($1::uuid, $2::text)`,
      [id, purpose],
    );
    const row = result.rows[0];
    return row
      ? {
          userId: row.user_id,
          challenge: row.challenge,
          expectedOrigin: row.expected_origin,
          rpId: row.rp_id,
          expiresAt: row.expires_at,
        }
      : null;
  },

  async readCredential(credentialId): Promise<PasskeyCredential | null> {
    const result = await runWebappPgText<{
      credential_id: string;
      user_id: string;
      user_handle: string;
      public_key: string;
      counter: string | number;
      transports: unknown;
      device_type: string;
      backed_up: boolean;
    }>(
      `SELECT
         credential_id,
         user_id::text,
         user_handle,
         public_key,
         counter,
         transports,
         device_type,
         backed_up
       FROM app.passkey_read_credential($1::text)`,
      [credentialId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      credentialId: row.credential_id,
      userId: row.user_id,
      userHandle: row.user_handle,
      publicKey: row.public_key,
      counter: Number(row.counter),
      transports: parseTransports(row.transports),
      deviceType: parseDeviceType(row.device_type),
      backedUp: row.backed_up,
    };
  },

  async completeRegistration(input) {
    const result = await runWebappPgText<{ completed: boolean }>(
      `SELECT app.passkey_complete_registration(
         $1::uuid,
         $2::uuid,
         $3::text,
         $4::text,
         $5::bigint,
         $6::jsonb,
         $7::text,
         $8::boolean
       ) AS completed`,
      [
        input.challengeId,
        input.userId,
        input.credentialId,
        input.publicKey,
        input.counter,
        JSON.stringify(input.transports),
        input.deviceType,
        input.backedUp,
      ],
    );
    return result.rows[0]?.completed === true;
  },

  async completeAuthentication(input) {
    const result = await runWebappPgText<{ user_id: string | null }>(
      `SELECT app.passkey_complete_authentication(
         $1::uuid,
         $2::text,
         $3::bigint,
         $4::bigint,
         $5::text,
         $6::boolean
       )::text AS user_id`,
      [
        input.challengeId,
        input.credentialId,
        input.previousCounter,
        input.newCounter,
        input.deviceType,
        input.backedUp,
      ],
    );
    return result.rows[0]?.user_id ?? null;
  },

  async deleteCredential(_userId, credentialId) {
    const result = await runWebappPgText<{ deleted: boolean }>(
      `SELECT app.passkey_delete_current_credential($1::text) AS deleted`,
      [credentialId],
    );
    return result.rows[0]?.deleted === true;
  },
};
