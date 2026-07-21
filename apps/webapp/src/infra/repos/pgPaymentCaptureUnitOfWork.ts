import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { runInDrizzleMutationTransaction } from "@/infra/db/drizzleMutationTx";
import { withClient } from "@/infra/db/withClient";
import { pgSessionAdvisoryLock, pgSessionAdvisoryUnlock } from "@/infra/db/pgAdvisoryLock";
import type { PaymentCaptureUnitOfWork } from "@/modules/payments/ports";

const DELIVERY_LOCK_PREFIX = "payment_capture_delivery:";

/**
 * One database transaction for the durable payment-capture consequences.
 * Provider verification and post-commit delivery stay outside this boundary.
 */
export function createPgPaymentCaptureUnitOfWork(): PaymentCaptureUnitOfWork {
  return {
    run(organizationId, fn) {
      return runWithDbOrganizationPrincipal(organizationId, () => runInDrizzleMutationTransaction(fn));
    },
    runSerializedPostCommit(organizationId, captureKey, fn) {
      const lockKey = `${DELIVERY_LOCK_PREFIX}${organizationId}:${captureKey}`;
      return runWithDbOrganizationPrincipal(organizationId, () =>
        withClient(async (client) => {
          await pgSessionAdvisoryLock(client, lockKey);
          try {
            return await fn();
          } finally {
            await pgSessionAdvisoryUnlock(client, lockKey);
          }
        }),
      );
    },
  };
}
