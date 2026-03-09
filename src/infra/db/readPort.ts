import type { DbPort, DbReadPort, DbReadQuery } from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { getAdminStats } from './repos/adminStats.js';
import { getActiveRecordsByPhone, getRecordByExternalId } from './repos/bookingRecords.js';
import { getLinkDataByIdentity, getNotificationSettings } from './repos/channelUsers.js';
import {
  getActiveDraftByIdentity,
  getConversationById,
  getOpenConversationByIdentity,
  listOpenConversations,
} from './repos/messageThreads.js';
import { findUserByChannelId, findUserByPhone, lookupUser } from './repos/userLookup.js';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const stringValue = asNonEmptyString(value);
  if (!stringValue) return null;
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function handleUserLookup<T = unknown>(db: DbPort, query: DbReadQuery): Promise<T> {
  const resource = asNonEmptyString(query.params.resource);
  const by = asNonEmptyString(query.params.by);
  const value = asNonEmptyString(query.params.value);

  if (!resource || !by || !value) return null as T;

  return (await lookupUser(db, resource, by, value)) as T;
}

export function createDbReadPort(input: { db?: DbPort } = {}): DbReadPort {
  const db = input.db ?? createDbPort();
  return {
    async readDb<T = unknown>(query: DbReadQuery): Promise<T> {
      switch (query.type) {
        case 'user.lookup':
          return handleUserLookup<T>(db, query);
        case 'user.byPhone': {
          const phone = asNonEmptyString(query.params.phoneNormalized);
          if (!phone) return null as T;
          return (await findUserByPhone(db, phone)) as T;
        }
        case 'user.byChannelId': {
          const channelId = asNonEmptyString(query.params.channelId);
          if (!channelId) return null as T;
          return (await findUserByChannelId(db, channelId)) as T;
        }
        case 'user.byIdentity': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          if (!resource || !externalId) return null as T;
          return (await getLinkDataByIdentity(db, resource, externalId)) as T;
        }
        case 'draft.activeByIdentity': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          const source = asNonEmptyString(query.params.source);
          if (!resource || !externalId) return null as T;
          return (await getActiveDraftByIdentity(db, { resource, externalId, ...(source ? { source } : {}) })) as T;
        }
        case 'conversation.openByIdentity': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          const source = asNonEmptyString(query.params.source);
          if (!resource || !externalId) return null as T;
          return (await getOpenConversationByIdentity(db, { resource, externalId, ...(source ? { source } : {}) })) as T;
        }
        case 'conversation.byId': {
          const id = asNonEmptyString(query.params.id ?? query.params.conversationId);
          if (!id) return null as T;
          return (await getConversationById(db, { id })) as T;
        }
        case 'conversation.listOpen': {
          const source = asNonEmptyString(query.params.source);
          const limit = asFiniteNumber(query.params.limit);
          return (await listOpenConversations(db, { ...(source ? { source } : {}), ...(limit !== null ? { limit } : {}) })) as T;
        }
        case 'notifications.settings': {
          const resource = asNonEmptyString(query.params.resource) ?? 'telegram';
          if (resource !== 'telegram') return null as T;
          const channelUserId = asFiniteNumber(query.params.channelUserId ?? query.params.channelId);
          if (channelUserId === null) return null as T;
          return (await getNotificationSettings(db, channelUserId)) as T;
        }
        case 'booking.byExternalId': {
          const recordId = asNonEmptyString(query.params.externalRecordId ?? query.params.recordId);
          if (!recordId) return null as T;
          return (await getRecordByExternalId(db, recordId)) as T;
        }
        case 'booking.activeByUser': {
          const userId = asNonEmptyString(query.params.userId);
          if (!userId) return [] as T;
          return (await getActiveRecordsByPhone(db, userId)) as T;
        }
        case 'stats.adminDashboard':
          return (await getAdminStats(db)) as T;
        default:
          return null as T;
      }
    },
  };
}
