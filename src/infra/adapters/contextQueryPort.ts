import type { ContextQuery, ContextQueryPort, DbReadPort } from '../../kernel/contracts/index.js';

function normalizePhoneForLookup(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits) return value;
  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.length === 11 && onlyDigits.startsWith('8')) return `+7${onlyDigits.slice(1)}`;
  if (onlyDigits.length === 11 && onlyDigits.startsWith('7')) return `+${onlyDigits}`;
  if (onlyDigits.length === 10) return `+7${onlyDigits}`;
  if (digits.startsWith('+') && /^\+\d{10,15}$/.test(digits)) return digits;
  if (onlyDigits.length >= 10 && onlyDigits.length <= 15) return `+${onlyDigits}`;
  return value;
}

/** Optional base URL of the webapp (e.g. https://webapp.example.com). Used as fallback for booking item links when RubiTime does not provide one. */
export type ContextQueryPortInput = {
  readPort: DbReadPort;
  webappBaseUrl?: string | null;
};

export function createContextQueryPort(input: ContextQueryPortInput): ContextQueryPort {
  const webappBaseUrl = typeof input.webappBaseUrl === 'string' && input.webappBaseUrl.trim().length > 0
    ? input.webappBaseUrl.replace(/\/$/, '')
    : null;
  const cabinetFallbackLink = webappBaseUrl ? `${webappBaseUrl}/app/patient/cabinet` : null;

  return {
    async request(query: ContextQuery): Promise<unknown> {
      switch (query.type) {
        case 'channel.lookupByPhone': {
          const phoneNormalized = normalizePhoneForLookup(query.phoneNormalized);
          if (!phoneNormalized) return { type: 'channel.lookupByPhone', item: null };
          const resource = typeof query.resource === 'string' && query.resource.trim().length > 0
            ? query.resource
            : 'telegram';
          const item = await input.readPort.readDb<{
            chatId?: number;
            channelId?: string;
            username?: string | null;
          } | null>({
            type: 'user.lookup',
            params: {
              resource,
              by: 'phone',
              value: phoneNormalized,
            },
          });
          return { type: 'channel.lookupByPhone', item };
        }
        case 'bookings.forUser': {
          const userId = query.userId;
          if (!userId) return { type: 'bookings.forUser', items: [] };
          const rawItems = await input.readPort.readDb<Array<{ recordAt?: unknown; status?: unknown; link?: unknown }>>({
            type: 'booking.activeByUser',
            params: { userId },
          });
          const items = Array.isArray(rawItems)
            ? rawItems.map((item) => ({
                ...item,
                link: (typeof item.link === 'string' && item.link.trim().length > 0 ? item.link : null) ?? cabinetFallbackLink,
              }))
            : [];
          return { type: 'bookings.forUser', items };
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
