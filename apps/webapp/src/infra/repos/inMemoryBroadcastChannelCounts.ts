import type {
  BroadcastChannelCounts,
  BroadcastChannelCountsPort,
} from "@/modules/doctor-broadcasts/draftPort";

export const DEFAULT_IN_MEMORY_CHANNEL_COUNTS: BroadcastChannelCounts = {
  bot_message: 0,
  telegram: 0,
  max: 0,
  sms: 0,
  push: 0,
  email: 0,
};

export function createInMemoryBroadcastChannelCountsPort(
  counts: BroadcastChannelCounts = DEFAULT_IN_MEMORY_CHANNEL_COUNTS,
): BroadcastChannelCountsPort {
  return {
    async getChannelConnectionCounts(): Promise<BroadcastChannelCounts> {
      return { ...counts };
    },
    async getChannelCountsByUserIds(_userIds: readonly string[]): Promise<BroadcastChannelCounts> {
      return { ...DEFAULT_IN_MEMORY_CHANNEL_COUNTS };
    },
  };
}
