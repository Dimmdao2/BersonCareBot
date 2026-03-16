export type ChannelCode = "telegram" | "max" | "vk";

export type ChannelPreference = {
  channelCode: ChannelCode;
  isEnabledForMessages: boolean;
  isEnabledForNotifications: boolean;
};

export type ChannelCard = {
  code: ChannelCode;
  title: string;
  openUrl: string;
  isLinked: boolean;
  isImplemented: boolean;
  isEnabledForMessages: boolean;
  isEnabledForNotifications: boolean;
};
