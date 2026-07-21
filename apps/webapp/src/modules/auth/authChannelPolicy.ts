import { getPublicRuntimeBool } from "@/modules/system-settings/configAdapter";

export type AuthChannel = "email" | "sms" | "telegram" | "max";

export type AuthChannelPolicy = Readonly<Record<AuthChannel, boolean>>;

const SETTING_BY_CHANNEL = {
  email: "auth_email_enabled",
  sms: "auth_sms_enabled",
  telegram: "auth_telegram_enabled",
  max: "auth_max_enabled",
} as const;

export async function isAuthChannelEnabled(channel: AuthChannel): Promise<boolean> {
  return getPublicRuntimeBool(SETTING_BY_CHANNEL[channel], "public_auth_config");
}

export async function getAuthChannelPolicy(): Promise<AuthChannelPolicy> {
  const [email, sms, telegram, max] = await Promise.all([
    isAuthChannelEnabled("email"),
    isAuthChannelEnabled("sms"),
    isAuthChannelEnabled("telegram"),
    isAuthChannelEnabled("max"),
  ]);
  return { email, sms, telegram, max };
}
