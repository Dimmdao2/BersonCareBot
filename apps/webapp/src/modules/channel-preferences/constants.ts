import type { ChannelCode } from "./types";

export const CHANNEL_LIST: Array<{
  code: ChannelCode;
  title: string;
  openUrl: string;
  implemented: boolean;
}> = [
  { code: "telegram", title: "Telegram", openUrl: "https://t.me/bersoncare_bot", implemented: true },
  { code: "max", title: "MAX", openUrl: "https://max.ru/id780713840637_1_bot", implemented: true },
  { code: "vk", title: "ВКонтакте", openUrl: "https://vk.com", implemented: false },
  { code: "sms", title: "SMS", openUrl: "", implemented: true },
  { code: "email", title: "Email", openUrl: "", implemented: true },
];
