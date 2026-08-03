import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import type { IdentityResolutionPort } from '@/modules/auth/identityResolutionPort';
import type { DoctorClientsPort } from '@/modules/doctor-clients/ports';

/**
 * Moved here from `infra/repos/pgUserProjection.ts` (D15b/3) — the port type belongs in the
 * module, the repository is only its implementation (AGENTS.md §5.3).
 */
export type UserProjectionPort = {
  upsertFromProjection: (params: {
    integratorUserId: string;
    phoneNormalized?: string;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    channelCode?: string;
    externalId?: string;
  }) => Promise<{ platformUserId: string }>;
  findByIntegratorId: (integratorUserId: string) => Promise<{
    platformUserId: string;
    phoneNormalized?: string | null;
  } | null>;
  findByPhoneNormalized: (phoneNormalized: string) => Promise<{ platformUserId: string } | null>;
  updatePhone: (platformUserId: string, phoneNormalized: string) => Promise<void>;
  /** Update structured profile fields (first_name, last_name, email) by phone; no-op if no user found. */
  updateProfileByPhone: (params: {
    phoneNormalized: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }) => Promise<void>;
  upsertNotificationTopics: (params: {
    platformUserId: string;
    topics: { topicCode: string; isEnabled: boolean }[];
  }) => Promise<void>;
  updateRole: (platformUserId: string, role: string) => Promise<void>;
  getProfileEmailFields: (platformUserId: string) => Promise<{
    email: string | null;
    emailVerifiedAt: string | null;
  }>;
  /** Сброс email у своего аккаунта врача/админа (`role IN ('doctor','admin')`). */
  clearStaffAccountEmail: (
    platformUserId: string,
  ) => Promise<{ ok: true } | { ok: false; reason: 'not_found_or_not_staff' | 'already_empty' }>;
  /**
   * Admin (webapp): правка ФИО/email/телефона канонического клиента по `platform_users.id`.
   * Только `role = client`, `merged_into_id IS NULL`. Смена email сбрасывает верификацию при изменении значения.
   */
  patchAdminClientProfile: (params: {
    platformUserId: string;
    patch: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phoneNormalized?: string | null;
    };
  }) => Promise<
    { ok: true } | { ok: false; reason: 'nothing_to_update' | 'not_found_or_not_client' }
  >;
  findPlatformUserIdWithEmailConflict: (
    canonicalId: string,
    email: string,
  ) => Promise<string | null>;
  findPlatformUserIdWithPhoneConflict: (
    canonicalId: string,
    phoneNormalized: string,
  ) => Promise<string | null>;
};

/**
 * The identity port (D15b/3 — owner §2b, `IDENTITY_AND_MERGE_SCHEME.md`): the single module that
 * knows how a platform user's entity is assembled and from what.
 *
 * - `projection` — who this person is: FIO/contacts/role writes and the profile-conflict checks
 *   that guard them (`UserProjectionPort`, implemented by `infra/repos/pgUserProjection.ts`).
 * - `session` — phone/OTP/password session identity: contact lookup, session-entity assembly,
 *   session-epoch revocation (`UserByPhonePort`, implemented by `infra/repos/pgUserByPhone.ts`).
 * - `channelResolution` — messenger channel-binding identity: find-or-create by Telegram/MAX/VK
 *   binding (`IdentityResolutionPort`, implemented by `infra/repos/pgIdentityResolution.ts`).
 * - `clients` — doctor-facing identity reads (`ClientIdentity`/`ClientListItem`/`PatientCardHeader`)
 *   (`DoctorClientsPort`, implemented by `infra/repos/pgDoctorClients.ts`).
 *
 * Callers depend on this type, not on which repository, table, or database backs each field — a
 * later stage (RLS on `platform_users`, then separate tables, then separate databases — §2c) swaps
 * what implements one of these four fields without touching callers. OAuth resolution, channel-link
 * claim, and phone-messenger-bind stay as their own bound ports under `modules/auth/*` for this pass
 * (see D15B3 report) — folding them into this aggregate is follow-up work, not required for D15b/3.
 */
export type IdentityPort = {
  projection: UserProjectionPort;
  session: UserByPhonePort;
  channelResolution: IdentityResolutionPort;
  clients: DoctorClientsPort;
};
