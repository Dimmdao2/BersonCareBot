export type NotificationTopicMasterRow = {
  topicCode: string;
  isEnabled: boolean;
};

/** Master enable/disable per notification topic (`user_notification_topics`). */
export type PatientNotificationTopicsPort = {
  listByUserId: (userId: string) => Promise<NotificationTopicMasterRow[]>;
  setTopicEnabled: (userId: string, topicCode: string, isEnabled: boolean) => Promise<void>;
};
