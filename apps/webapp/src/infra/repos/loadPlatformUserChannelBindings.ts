import { eq } from 'drizzle-orm';
import { userChannelBindings } from '../../../db/schema/schema';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import type { ChannelBindings } from '@/shared/types/session';

export type PlatformUserChannelBindingRow = {
  channelCode: string;
  externalId: string;
};

/** Несхлопнутые строки нужны security-уведомлениям после merge: получатель важнее UI-проекции. */
export async function loadPlatformUserChannelBindingRows(
  platformUserId: string,
): Promise<PlatformUserChannelBindingRow[]> {
  return getWebappSqlDb()
    .select({
      channelCode: userChannelBindings.channelCode,
      externalId: userChannelBindings.externalId,
    })
    .from(userChannelBindings)
    .where(eq(userChannelBindings.userId, platformUserId));
}

/** Канонические привязки мессенджеров пациента для M2M / server-side fan-out. */
export async function loadPlatformUserChannelBindings(
  platformUserId: string,
): Promise<ChannelBindings> {
  const rows = await loadPlatformUserChannelBindingRows(platformUserId);
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    if (row.channelCode === 'telegram') bindings.telegramId = row.externalId;
    else if (row.channelCode === 'max') bindings.maxId = row.externalId;
    else if (row.channelCode === 'vk') bindings.vkId = row.externalId;
  }
  return bindings;
}
