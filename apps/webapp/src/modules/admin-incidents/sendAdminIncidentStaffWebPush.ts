/**
 * CANARY MIGRATION (P18 — PLAN S14a).
 *
 * Instead of calling `sendWebPushToSubscriptions` directly (G2-guarded webapp sink),
 * this function now emits a `web_push` intent to the integrator via relay-outbound.
 * The integrator's `WebPushDeliveryAdapter` handles the actual send, covered by the
 * pre-fork redirect chokepoint (G1). G2 guard in `sendWebPushToSubscriptions.ts` is
 * kept intact — it still protects the other 6 un-migrated legs (S14b–S14g).
 *
 * The declared audience root already excludes disabled and unsubscribed recipients. Keeping that
 * filter in the root avoids reopening its protected relations from this machine tick.
 */
import { logger } from '@/app-layer/logging/logger';
import type { StaffUsersPort } from '@/modules/doctor-notifications/staffUsersPort';
import { relayOperatorAlert } from '@/modules/operator-alerts/relayOperatorAlert';

export type AdminIncidentStaffPushDeps = {
  staffUsers: StaffUsersPort;
};

export type AdminIncidentStaffPushResult = {
  audienceCount: number;
  deliveredCount: number;
};

export async function sendAdminIncidentStaffWebPush(
  input: {
    organizationId?: string;
    topic: string;
    dedupKey: string;
    pushTitle: string;
    pushBody: string;
    pushUrl: string;
  },
  deps: AdminIncidentStaffPushDeps,
): Promise<AdminIncidentStaffPushResult> {
  const membershipRecipients = deps.staffUsers.listActiveStaffOrganizationRecipients
    ? await deps.staffUsers.listActiveStaffOrganizationRecipients()
    : [];
  const recipients = membershipRecipients.filter(
    (recipient) => !input.organizationId || recipient.organizationId === input.organizationId,
  );
  if (recipients.length === 0) return { audienceCount: 0, deliveredCount: 0 };

  const results = await Promise.all(
    recipients.map(async ({ userId, organizationId }) => {
      // Emit a web_push intent to the integrator via relay-outbound.
      // The integrator's WebPushDeliveryAdapter (S14a) performs the actual send.
      // The final environment gate suppresses local DEV and non-allowlisted TEST recipients.
      const tag = `admin-incident:${input.topic}:${input.dedupKey}`;
      const result = await relayOperatorAlert({
        messageId: `admin-incident-push:${organizationId}:${userId}:${tag}`,
        organizationId,
        channel: 'web_push',
        recipient: userId,
        text: input.pushBody,
        metadata: {
          title: input.pushTitle,
          url: input.pushUrl,
          pushExtras: { tag },
        },
      }).catch((err: unknown) => {
        logger.warn(
          { err, userId, topic: input.topic },
          'admin incident staff web push relay failed',
        );
        return { ok: false as const, reason: 'relay_error' };
      });

      return result.ok && result.status !== 'skipped';
    }),
  );

  return {
    audienceCount: recipients.length,
    deliveredCount: results.filter(Boolean).length,
  };
}
