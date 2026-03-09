import type { ContextQuery, ContextQueryPort, DbReadPort } from '../../kernel/contracts/index.js';

export function createContextQueryPort(input: { readPort: DbReadPort }): ContextQueryPort {
  return {
    async request(query: ContextQuery): Promise<unknown> {
      switch (query.type) {
        case 'bookings.forUser': {
          const userId = query.userId;
          if (!userId) return { type: 'bookings.forUser', items: [] };
          const items = await input.readPort.readDb<Record<string, unknown>[]>({
            type: 'booking.activeByUser',
            params: { userId },
          });
          return { type: 'bookings.forUser', items: Array.isArray(items) ? items : [] };
        }
        case 'subscriptions.forUser': {
          const userId = query.userId;
          if (!userId) return { type: 'subscriptions.forUser', items: [] };
          const channelUser = await input.readPort.readDb<{
            chatId?: number;
            channelId?: string;
            username?: string | null;
          } | null>({
            type: 'user.lookup',
            params: {
              resource: 'channel',
              by: 'phone',
              value: userId,
            },
          });
          if (!channelUser || typeof channelUser.chatId !== 'number') {
            return { type: 'subscriptions.forUser', items: [] };
          }
          return {
            type: 'subscriptions.forUser',
            items: [
              {
                kind: 'channel',
                chatId: channelUser.chatId,
                channelId: channelUser.channelId ?? String(channelUser.chatId),
                username: channelUser.username ?? null,
                notificationsEnabled: true,
              },
            ],
          };
        }
        case 'user.identityLinks': {
          const userId = query.userId;
          if (!userId) return { type: 'user.identityLinks', items: [] };
          return { type: 'user.identityLinks', items: [{ kind: 'userId', value: userId }] };
        }
        case 'booking.recordByExternalId': {
          const recordId = query.recordId;
          if (!recordId) return { type: 'booking.recordByExternalId', record: null };
          const record = await input.readPort.readDb<Record<string, unknown> | null>({
            type: 'booking.byExternalId',
            params: { externalRecordId: recordId },
          });
          return { type: 'booking.recordByExternalId', record };
        }
        case 'admin.stats': {
          const stats = await input.readPort.readDb<{
            activeBookings: number;
            userCountsByIntegration: Record<string, { total: number; withPhone?: number }>;
          }>({ type: 'stats.adminDashboard', params: {} });
          return { type: 'admin.stats', ...stats };
        }
        default:
          return { type: 'bookings.forUser', items: [] };
      }
    },
  };
}
