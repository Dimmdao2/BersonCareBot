import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { ChannelBindings } from "@/shared/types/session";

/** Канонические привязки мессенджеров пациента для M2M / server-side fan-out. */
export async function loadPlatformUserChannelBindings(platformUserId: string): Promise<ChannelBindings> {
  const result = await runWebappPgText<{ channel_code: string; external_id: string }>(
    `SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1::uuid`,
    [platformUserId],
  );
  const bindings: ChannelBindings = {};
  for (const row of result.rows) {
    if (row.channel_code === "telegram") bindings.telegramId = row.external_id;
    else if (row.channel_code === "max") bindings.maxId = row.external_id;
    else if (row.channel_code === "vk") bindings.vkId = row.external_id;
  }
  return bindings;
}
