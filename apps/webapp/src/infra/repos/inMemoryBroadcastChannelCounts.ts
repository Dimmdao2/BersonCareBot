import type {
  BroadcastChannelCounts,
  BroadcastChannelCountsPort,
} from "@/modules/doctor-broadcasts/draftPort";

export function createInMemoryBroadcastChannelCountsPort(
  counts: BroadcastChannelCounts = { bot_message: 0, sms: 0, push: 0 },
): BroadcastChannelCountsPort {
  return {
    async getChannelConnectionCounts(): Promise<BroadcastChannelCounts> {
      return { ...counts };
    },
  };
}
