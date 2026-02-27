/** Контракт настроек уведомлений пользователя. */
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
  /** Читает текущие настройки уведомлений пользователя. */
  getNotificationSettings(telegramId: number): Promise<NotificationSettings | null>;
  /** Частично обновляет настройки уведомлений пользователя. */
  updateNotificationSettings(
    telegramId: number,
    settings: NotificationSettingsPatch,
  ): Promise<void>;
};
