import type { ContextQuery, ContextQueryPort, DbReadPort, DeliveryTargetsPort } from '../../kernel/contracts/index.js';

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

/** Map webapp channelBindings to context item { chatId, channelId, username } for a given resource. */
function bindingsToLookupItem(
  bindings: Record<string, string> | null,
  resource: string,
): { chatId?: number; channelId?: string; username?: string | null } | null {
  if (!bindings || typeof bindings !== 'object') return null;
  const telegramId = typeof bindings.telegramId === 'string' && bindings.telegramId.trim().length > 0
    ? bindings.telegramId.trim()
    : null;
  const maxId = typeof bindings.maxId === 'string' && bindings.maxId.trim().length > 0
    ? bindings.maxId.trim()
    : null;
  if (resource === 'telegram' && telegramId) {
    const chatId = Number(telegramId);
    return Number.isFinite(chatId) ? { chatId, channelId: telegramId, username: null } : { channelId: telegramId, username: null };
  }
  if (resource === 'max' && maxId) return { channelId: maxId, username: null };
  if (!resource || resource === 'channel') {
    if (telegramId) {
      const chatId = Number(telegramId);
      return Number.isFinite(chatId) ? { chatId, channelId: telegramId, username: null } : { channelId: telegramId, username: null };
    }
    if (maxId) return { channelId: maxId, username: null };
  }
  return null;
}

/** Optional base URL of the webapp (e.g. https://webapp.example.com). Used as fallback for booking item links when RubiTime does not provide one. */
export type ContextQueryPortInput = {
  readPort: DbReadPort;
  webappBaseUrl?: string | null;
  /** Webapp-backed delivery targets; used for product-side person/channel lookup instead of legacy readPort user.lookup. */
  deliveryTargetsPort?: DeliveryTargetsPort | null;
};

export function createContextQueryPort(input: ContextQueryPortInput): ContextQueryPort {
  const webappBaseUrl = typeof input.webappBaseUrl === 'string' && input.webappBaseUrl.trim().length > 0
    ? input.webappBaseUrl.replace(/\/$/, '')
    : null;
  const cabinetFallbackLink = webappBaseUrl ? `${webappBaseUrl}/app/patient/cabinet` : null;
  const deliveryTargetsPort = input.deliveryTargetsPort ?? null;

  return {
    async request(query: ContextQuery): Promise<unknown> {
      switch (query.type) {
        case 'channel.lookupByPhone': {
          const phoneNormalized = normalizePhoneForLookup(query.phoneNormalized);
          if (!phoneNormalized) return { type: 'channel.lookupByPhone', item: null };
          const resource = typeof query.resource === 'string' && query.resource.trim().length > 0
            ? query.resource
            : 'telegram';
          if (deliveryTargetsPort) {
            const bindings = await deliveryTargetsPort.getTargetsByPhone(phoneNormalized);
            const item = bindingsToLookupItem(bindings ?? null, resource);
            return { type: 'channel.lookupByPhone', item };
          }
          const item = await input.readPort.readDb<{
            chatId?: number;
            channelId?: string;
            username?: string | null;
          } | null>({
            type: 'user.lookup',
            params: { resource, by: 'phone', value: phoneNormalized },
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
          if (deliveryTargetsPort) {
            const bindings = await deliveryTargetsPort.getTargetsByPhone(userId.trim());
            const items: Array<{ kind: string; chatId: number; channelId: string; username: string | null; notificationsEnabled: boolean }> = [];
            if (bindings?.telegramId) {
              const tid = bindings.telegramId.trim();
              const chatId = Number(tid);
              items.push({
                kind: 'channel',
                chatId: Number.isFinite(chatId) ? chatId : 0,
                channelId: tid,
                username: null,
                notificationsEnabled: true,
              });
            }
            if (bindings?.maxId) {
              items.push({
                kind: 'channel',
                chatId: 0,
                channelId: bindings.maxId.trim(),
                username: null,
                notificationsEnabled: true,
              });
            }
            return { type: 'subscriptions.forUser', items };
          }
          const channelUser = await input.readPort.readDb<{
            chatId?: number;
            channelId?: string;
            username?: string | null;
          } | null>({
            type: 'user.lookup',
            params: { resource: 'channel', by: 'phone', value: userId },
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
