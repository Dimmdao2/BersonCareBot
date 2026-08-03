import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { OperatorHealthDigestReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import { outgoingDeliveryQueue } from '../../../db/schema/outgoingDeliveryQueue';
import { createPgOutgoingDeliveryQueueWritePort } from './pgOutgoingDeliveryQueue';

const queue = createPgOutgoingDeliveryQueueWritePort();

export async function enqueueOperatorHealthDigestDeliveries(
  deliveries: readonly OperatorHealthDigestReadyOutgoingDelivery[],
): Promise<number> {
  return runDrizzleMutationTransaction(async (tx) => {
    let inserted = 0;
    for (const delivery of deliveries) {
      if (await queue.enqueueReady(tx, delivery)) inserted += 1;
    }
    return inserted;
  });
}

export async function loadLatestSentOperatorHealthDigestAt(): Promise<string | null> {
  const rows = await getDrizzle()
    .select({ sentAt: outgoingDeliveryQueue.sentAt })
    .from(outgoingDeliveryQueue)
    .where(
      and(
        eq(outgoingDeliveryQueue.kind, 'operator_health_digest'),
        isNotNull(outgoingDeliveryQueue.sentAt),
      ),
    )
    .orderBy(desc(outgoingDeliveryQueue.sentAt))
    .limit(1);
  return rows[0]?.sentAt ?? null;
}
