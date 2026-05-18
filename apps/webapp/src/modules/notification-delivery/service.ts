import { logger } from "@/infra/logging/logger";
import type { NotificationDeliveryAttemptsPort } from "./ports";
import type { RecordNotificationDeliveryAttemptInput } from "./types";

export function createNotificationDeliveryService(port: NotificationDeliveryAttemptsPort) {
  return {
    async recordNotificationDeliveryAttempt(input: RecordNotificationDeliveryAttemptInput): Promise<void> {
      try {
        await port.recordAttempt(input);
      } catch (err) {
        logger.warn(
          {
            err,
            channel: input.channel,
            status: input.status,
            reason: input.reason,
          },
          "notification_delivery_attempt_record_failed",
        );
      }
    },
    getHealthSnapshot24h: () => port.getHealthSnapshot24h(),
  };
}

export type NotificationDeliveryService = ReturnType<typeof createNotificationDeliveryService>;
