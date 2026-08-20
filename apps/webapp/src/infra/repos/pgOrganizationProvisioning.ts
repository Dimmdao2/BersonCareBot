import { and, eq, isNull } from 'drizzle-orm';
import { runWebappPgText, runWebappTransaction } from '@/infra/db/runWebappSql';
import type {
  OrganizationProvisioningPort,
  SpecialistSignupIntent,
} from '@/modules/organization-provisioning/ports';
import { beOrganizationMembers, beSpecialists } from '../../../db/schema/bookingEngine';
import { adminAuditLog } from '../../../db/schema/schema';

type SpecialistSignupIntentDbRow = {
  id: string;
  user_id: string;
  challenge_id: string;
  email_normalized: string;
  organization_title: string;
  organization_slug: string | null;
  specialist_full_name: string;
  status: string;
  provisioned_organization_id: string | null;
  provisioned_specialist_id: string | null;
  provisioned_membership_id: string | null;
};

// Единственный арбитр владения адресом — уникальный индекс по имени. Так же считает и сама
// функция БД (deploy/postgres/specialist-owner-provisioning-rls.sql:265): она сверяет имя
// ограничения и всё остальное поднимает дальше, а не выдаёт за занятое имя.
//
// До 19.08 здесь стоял голый `code === '23505'`, и на шаге создания заявки достижимы совсем
// другие уникальные ограничения — `uq_specialist_signup_intents_user_id` и
// `specialist_signup_intents_challenge_id_key`, оба про повторную заявку, а не про имя. Человек,
// вернувшийся в регистрацию со своей же заявкой, слышал «это имя занято» и уходил придумывать
// новое, хотя имя было свободно. Ошибка обязана называть тот шаг, который действительно упал.
const SLUG_OWNERSHIP_INDEX = 'uq_organization_slug_claims_slug';

function isSlugUnavailableDbError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  return (
    (value.code === '23505' && value.constraint === SLUG_OWNERSHIP_INDEX) ||
    (typeof value.message === 'string' && value.message.includes('slug_unavailable')) ||
    isSlugUnavailableDbError(value.cause)
  );
}

function mapIntentDbRow(row: SpecialistSignupIntentDbRow): SpecialistSignupIntent {
  if (row.status !== 'pending' && row.status !== 'provisioned') {
    throw new Error(`Unexpected specialist_signup_intents.status: ${row.status}`);
  }
  return {
    id: row.id,
    userId: row.user_id,
    challengeId: row.challenge_id,
    emailNormalized: row.email_normalized,
    organizationTitle: row.organization_title,
    organizationSlug: row.organization_slug,
    specialistFullName: row.specialist_full_name,
    status: row.status,
    provisionedOrganizationId: row.provisioned_organization_id,
    provisionedSpecialistId: row.provisioned_specialist_id,
    provisionedMembershipId: row.provisioned_membership_id,
  };
}

export function createPgOrganizationProvisioningPort(): OrganizationProvisioningPort {
  return {
    async createSpecialistSignupIntent(input) {
      try {
        await runWebappTransaction(async (tx) => {
          await runWebappPgText(
            `SELECT app.create_specialist_signup_intent($1::uuid, $2, $3, $4, $5)`,
            [
              input.challengeId,
              input.emailNormalized,
              input.organizationTitle,
              input.specialistFullName,
              input.organizationSlug,
            ],
            tx,
          );
        });
      } catch (error) {
        if (isSlugUnavailableDbError(error)) throw new Error('slug_unavailable');
        throw error;
      }
    },

    async getPendingSpecialistSignupIntent({ userId, challengeId }) {
      return runWebappTransaction(async (tx) => {
        const result = await runWebappPgText<SpecialistSignupIntentDbRow>(
          `SELECT
             id::text,
             user_id::text,
             challenge_id::text,
             email_normalized,
             organization_title,
             organization_slug,
             specialist_full_name,
             status,
             provisioned_organization_id::text,
             provisioned_specialist_id::text,
             provisioned_membership_id::text
           FROM app.get_pending_specialist_signup_intent($1::uuid, $2::uuid)`,
          [userId, challengeId],
          tx,
        );
        return result.rows[0] ? mapIntentDbRow(result.rows[0]) : null;
      });
    },

    async getSpecialistSignupIntentByChallengeId(challengeId) {
      return runWebappTransaction(async (tx) => {
        const result = await runWebappPgText<SpecialistSignupIntentDbRow>(
          `SELECT
             id::text,
             user_id::text,
             challenge_id::text,
             email_normalized,
             organization_title,
             organization_slug,
             specialist_full_name,
             status,
             provisioned_organization_id::text,
             provisioned_specialist_id::text,
             provisioned_membership_id::text
           FROM app.get_specialist_signup_intent_by_challenge($1::uuid)`,
          [challengeId],
          tx,
        );
        return result.rows[0] ? mapIntentDbRow(result.rows[0]) : null;
      });
    },

    async getLatestSpecialistSignupIntentForUser() {
      return runWebappTransaction(async (tx) => {
        const result = await runWebappPgText<SpecialistSignupIntentDbRow>(
          `SELECT id::text, user_id::text, challenge_id::text, email_normalized,
                  organization_title, organization_slug, specialist_full_name, status,
                  provisioned_organization_id::text, provisioned_specialist_id::text,
                  provisioned_membership_id::text
           FROM app.get_latest_specialist_signup_intent_for_user()`,
          [],
          tx,
        );
        return result.rows[0] ? mapIntentDbRow(result.rows[0]) : null;
      });
    },

    async replacePendingSpecialistSignupChallenge({ challengeId, organizationSlug }) {
      try {
        return await runWebappTransaction(async (tx) => {
          const result = await runWebappPgText<{ replaced: boolean }>(
            'SELECT app.replace_pending_specialist_signup_challenge($1::uuid, $2::text) AS replaced',
            [challengeId, organizationSlug],
            tx,
          );
          return result.rows[0]?.replaced === true;
        });
      } catch (error) {
        if (isSlugUnavailableDbError(error)) throw new Error('slug_unavailable');
        throw error;
      }
    },

    async provisionSpecialistOwner({ challengeId }) {
      try {
        return await runWebappTransaction(async (tx) => {
          const result = await runWebappPgText<{
            ok: boolean;
            code: string | null;
            organization_id: string | null;
            specialist_id: string | null;
            membership_id: string | null;
          }>('SELECT * FROM app.provision_specialist_owner($1::uuid)', [challengeId], tx);
          const row = result.rows[0];
          if (!row) {
            throw new Error('specialist_signup_provision_insert_failed');
          }
          if (!row.ok) {
            throw new Error(row.code ?? 'specialist_signup_provision_insert_failed');
          }
          if (!row.organization_id || !row.specialist_id || !row.membership_id) {
            throw new Error('specialist_signup_provision_insert_failed');
          }
          return {
            organizationId: row.organization_id,
            specialistId: row.specialist_id,
            membershipId: row.membership_id,
          };
        });
      } catch (error) {
        if (isSlugUnavailableDbError(error)) throw new Error('slug_unavailable');
        throw error;
      }
    },

    async ensureOwnBookableSpecialist({ organizationId, membershipId, platformUserId, fullName }) {
      return runWebappTransaction(async (tx) => {
        const membershipRows = await tx
          .select({
            id: beOrganizationMembers.id,
            specialistId: beOrganizationMembers.specialistId,
            platformUserId: beOrganizationMembers.platformUserId,
            role: beOrganizationMembers.role,
          })
          .from(beOrganizationMembers)
          .where(
            and(
              eq(beOrganizationMembers.id, membershipId),
              eq(beOrganizationMembers.organizationId, organizationId),
              eq(beOrganizationMembers.status, 'active'),
            ),
          )
          .limit(1)
          .for('update');
        const membership = membershipRows[0];
        if (!membership) {
          throw new Error('organization_membership_not_found');
        }
        if (membership.platformUserId !== platformUserId) {
          throw new Error('organization_membership_actor_mismatch');
        }
        if (membership.role !== 'owner') {
          throw new Error('organization_membership_not_bookable');
        }
        if (membership.specialistId) {
          return { specialistId: membership.specialistId, created: false };
        }

        const now = new Date().toISOString();
        const specialists = await tx
          .insert(beSpecialists)
          .values({
            organizationId,
            fullName,
            isActive: true,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: beSpecialists.id });
        const specialistId = specialists[0]?.id;
        if (!specialistId) {
          throw new Error('specialist_provision_insert_failed');
        }

        const update = await tx
          .update(beOrganizationMembers)
          .set({
            specialistId,
            updatedAt: now,
          })
          .where(
            and(
              eq(beOrganizationMembers.id, membershipId),
              eq(beOrganizationMembers.organizationId, organizationId),
              isNull(beOrganizationMembers.specialistId),
            ),
          );
        if ((update.rowCount ?? 0) < 1) {
          throw new Error('specialist_membership_backfill_conflict');
        }

        await tx.insert(adminAuditLog).values({
          organizationId,
          actorId: platformUserId,
          action: 'specialist_self_binding_created',
          targetId: specialistId,
          details: { membershipId },
          status: 'ok',
        });

        return { specialistId, created: true };
      });
    },
  };
}
