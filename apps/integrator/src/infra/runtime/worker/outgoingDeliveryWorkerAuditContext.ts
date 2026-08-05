import { AsyncLocalStorage } from 'node:async_hooks';

const outgoingDeliveryWorkerAuditContext = new AsyncLocalStorage<{ active: true }>();

/** Marks the current async scope as outgoing-delivery worker row audit (D10a journal path). */
export function runWithOutgoingDeliveryWorkerAuditContext<T>(fn: () => T): T {
  return outgoingDeliveryWorkerAuditContext.run({ active: true }, fn);
}

/** True while processing a claimed outgoing_delivery_queue row (dispatch + pre-dispatch skips). */
export function isOutgoingDeliveryWorkerAuditContext(): boolean {
  return outgoingDeliveryWorkerAuditContext.getStore()?.active === true;
}
