import type { ChannelCode } from "./types";

const PREFERRED_AUTH_ALLOWED_CHANNELS = new Set<ChannelCode>(["telegram", "max", "email", "sms"]);

/** OTP / вход по телефону: каналы, для которых допустим флаг preferred auth. */
export function isChannelAllowedForPreferredAuth(channelCode: ChannelCode | null): boolean {
  if (channelCode == null) return true;
  return PREFERRED_AUTH_ALLOWED_CHANNELS.has(channelCode);
}

export class PreferredAuthChannelNotAllowedError extends Error {
  readonly code = "preferred_auth_channel_not_allowed";
  constructor(public readonly channelCode: ChannelCode) {
    super(`Канал «${channelCode}» нельзя использовать для кода входа`);
    this.name = "PreferredAuthChannelNotAllowedError";
  }
}

export function assertChannelAllowedForPreferredAuth(channelCode: ChannelCode | null): void {
  if (!isChannelAllowedForPreferredAuth(channelCode)) {
    throw new PreferredAuthChannelNotAllowedError(channelCode!);
  }
}
