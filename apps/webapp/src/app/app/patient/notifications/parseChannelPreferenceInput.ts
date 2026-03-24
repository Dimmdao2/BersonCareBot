import { z } from "zod";
import type { ChannelCode } from "@/modules/channel-preferences/types";

const channelCodeSchema = z.enum(["telegram", "max", "vk", "sms", "email"]);

export type ParseChannelNotificationResult =
  | { ok: true; code: ChannelCode; enabled: boolean }
  | { ok: false; reason: "invalid_channel" | "invalid_boolean" };

/** Валидация входа server action (клиент не должен доверяться). */
export function parseChannelNotificationInput(
  channelCode: unknown,
  enabled: unknown
): ParseChannelNotificationResult {
  const c = channelCodeSchema.safeParse(channelCode);
  if (!c.success) return { ok: false, reason: "invalid_channel" };
  const e = z.boolean().safeParse(enabled);
  if (!e.success) return { ok: false, reason: "invalid_boolean" };
  return { ok: true, code: c.data, enabled: e.data };
}
