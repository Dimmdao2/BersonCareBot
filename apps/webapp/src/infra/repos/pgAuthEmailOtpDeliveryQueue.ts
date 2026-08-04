import { sql } from 'drizzle-orm';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type { EnqueueEmailOtpDeliveryInput } from '@/modules/auth/emailOtpDeliveryQueuePort';

/**
 * D27-C fix round 2: `app.email_auth_enqueue_otp_delivery` (migration 0363) composes the message
 * itself from `public.email_challenges` -- this port call carries only the challenge id, nothing
 * that could compose an arbitrary email. See emailOtpDeliveryQueuePort.ts for why the input shrank
 * from `{eventId, email, code}` to just `{challengeId}`.
 *
 * D27-C fix round 3 (migration 0370): the accessor now also requires `deliveryToken`, the one-shot
 * ownership secret minted alongside the challenge -- a caller supplying only `challengeId` (round 2's
 * whole input) can no longer force or overwrite a send.
 */
export async function enqueueAuthEmailOtpDelivery(
  input: EnqueueEmailOtpDeliveryInput,
): Promise<void> {
  await runDrizzleMutationTransaction((tx) =>
    tx.execute(
      sql`SELECT app.email_auth_enqueue_otp_delivery(${input.challengeId}::uuid, ${input.deliveryToken}::uuid)`,
    ),
  );
}
