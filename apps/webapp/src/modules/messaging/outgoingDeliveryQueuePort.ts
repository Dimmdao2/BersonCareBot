/** Ready-to-dispatch envelope stored verbatim; resident runtime must not enrich it with policy. */
export type OutgoingIntent = {
  type: 'message.send';
  meta: {
    eventId: string;
    occurredAt: string;
    source: string;
    userId?: string;
    outboundMessageClass?: 'routine_product';
    outboundCapability?: 'app_push' | 'essential_delivery';
  };
  payload: Record<string, unknown>;
};

export type ReadyOutgoingDelivery = {
  organizationId: string;
  eventId: string;
  kind: 'specialist_task_reminder';
  channel: 'telegram' | 'max' | 'email' | 'web_push';
  intent: OutgoingIntent;
  /** Product-selected absolute schedule, never a worker-derived delay. */
  nextRetryAt: string;
};

/** The only webapp write seam for `public.outgoing_delivery_queue`. */
export type OutgoingDeliveryQueueWritePort<TransactionClient> = {
  enqueueReady(tx: TransactionClient, delivery: ReadyOutgoingDelivery): Promise<void>;
  terminalizeUnsentSpecialistTaskReminders(
    tx: TransactionClient,
    input: { taskId: string; exceptEventIds?: readonly string[]; reason: string },
  ): Promise<void>;
};
