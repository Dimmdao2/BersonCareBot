export type NotificationSettings = {
  notify_spb: boolean;
  notify_msk: boolean;
  notify_online: boolean;
};

export type NotificationSettingsPatch = {
  notify_spb?: boolean;
  notify_msk?: boolean;
  notify_online?: boolean;
};

export type NotificationsPort = {
  getNotificationSettings(telegramId: number): Promise<NotificationSettings | null>;
  updateNotificationSettings(
    telegramId: number,
    settings: NotificationSettingsPatch,
  ): Promise<void>;
};
