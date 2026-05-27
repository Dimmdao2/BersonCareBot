import { z } from "zod";
import { PRODUCT_ANALYTICS_ENTRY_CHANNELS } from "@/modules/product-analytics/types";

export const patientAnalyticsEventSchema = z.object({
  eventType: z.enum(["app_open", "page_view", "heartbeat"]),
  entryChannel: z.enum(PRODUCT_ANALYTICS_ENTRY_CHANNELS),
  occurredAt: z.string().max(64).optional(),
  /** Нормализованный ключ или сырой pathname — сервер нормализует pathname. */
  pageKey: z.string().min(1).max(512).optional(),
  pathname: z.string().min(1).max(2048).optional(),
  clientSessionId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export const patientAnalyticsEventsBodySchema = z.object({
  events: z.array(patientAnalyticsEventSchema).min(1).max(20),
});

export type PatientAnalyticsClientEvent = z.infer<typeof patientAnalyticsEventSchema>;
