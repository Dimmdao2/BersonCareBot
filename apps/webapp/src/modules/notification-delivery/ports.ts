import type {
  NotificationDeliveryHealthSnapshot,
  RecordNotificationDeliveryAttemptInput,
} from "./types";

export type NotificationDeliveryAttemptsPort = {
  recordAttempt(input: RecordNotificationDeliveryAttemptInput): Promise<void>;
  getHealthSnapshot24h(): Promise<NotificationDeliveryHealthSnapshot>;
};
