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
          const telegramUser = await input.readPort.readDb<{
            chatId?: number;
            telegramId?: string;
            username?: string | null;
          } | null>({
            type: 'user.lookup',
            params: {
              resource: 'telegram',
              by: 'phone',
              value: userId,
            },
          });
          if (!telegramUser || typeof telegramUser.chatId !== 'number') {
            return { type: 'subscriptions.forUser', items: [] };
          }
          return {
            type: 'subscriptions.forUser',
            items: [
              {
                kind: 'telegram',
                chatId: telegramUser.chatId,
                telegramId: telegramUser.telegramId ?? String(telegramUser.chatId),
                username: telegramUser.username ?? null,
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
        case 'rubitime.recordById': {
          const recordId = query.recordId;
          if (!recordId) return { type: 'rubitime.recordById', record: null };
          const record = await input.readPort.readDb<Record<string, unknown> | null>({
            type: 'booking.byRubitimeId',
            params: { rubitimeRecordId: recordId },
          });
          return { type: 'rubitime.recordById', record };
        }
        default:
          return { type: 'bookings.forUser', items: [] };
      }
    },
  };
}
