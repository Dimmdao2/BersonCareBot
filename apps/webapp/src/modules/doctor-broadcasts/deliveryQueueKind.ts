/** Значение `outgoing_delivery_queue.kind` для рассылок врача (синхронизировать с integrator `OutgoingDeliveryKind`). */
export const DOCTOR_BROADCAST_QUEUE_KIND = "doctor_broadcast_intent" as const;

export const DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS = 6;

/** Макс. строк очереди на одну рассылку (защита от перегрузки). */
export const MAX_BROADCAST_DELIVERY_JOBS = 2500;

export const BROADCAST_DELIVERY_CAP_EXCEEDED_CODE = "broadcast_delivery_cap_exceeded";
