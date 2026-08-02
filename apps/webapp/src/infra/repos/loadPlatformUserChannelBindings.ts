import { eq } from 'drizzle-orm';
import { userChannelBindings } from '../../../db/schema/schema';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import type { ChannelBindings } from '@/shared/types/session';

/** Канонические привязки мессенджеров пациента для M2M / server-side fan-out. */
export async function loadPlatformUserChannelBindings(
  platformUserId: string,
): Promise<ChannelBindings> {
  const rows = await getWebappSqlDb()
    .select({
      channelCode: userChannelBindings.channelCode,
      externalId: userChannelBindings.externalId,
    })
    .from(userChannelBindings)
    .where(eq(userChannelBindings.userId, platformUserId));
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    if (row.channelCode === 'telegram') bindings.telegramId = row.externalId;
    else if (row.channelCode === 'max') bindings.maxId = row.externalId;
    else if (row.channelCode === 'vk') bindings.vkId = row.externalId;
  }
  return bindings;
}
