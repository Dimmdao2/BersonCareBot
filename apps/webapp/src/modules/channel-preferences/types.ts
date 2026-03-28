export type ChannelCode = "telegram" | "max" | "vk" | "sms" | "email";

export type ChannelPreference = {
  channelCode: ChannelCode;
  isEnabledForMessages: boolean;
  isEnabledForNotifications: boolean;
  /** Единственный канал с true на пользователя — приоритет для OTP при входе. */
  isPreferredForAuth: boolean;
};

export type ChannelCard = {
  code: ChannelCode;
  title: string;
  openUrl: string;
  isLinked: boolean;
  isImplemented: boolean;
  isEnabledForMessages: boolean;
  isEnabledForNotifications: boolean;
  isPreferredForAuth?: boolean;
};
