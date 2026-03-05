import type { ChannelUserPort } from '../ports/user.js';
import type { ChannelUserFrom } from '../types.js';

export async function upsertUser(
  from: ChannelUserFrom | null | undefined,
  port: ChannelUserPort,
): Promise<{ id: string; channel_id: string } | null> {
  return port.upsertUser(from);
}

export async function tryConsumeStart(channelUserId: number, port: ChannelUserPort): Promise<boolean> {
  return port.tryConsumeStart(channelUserId);
}
