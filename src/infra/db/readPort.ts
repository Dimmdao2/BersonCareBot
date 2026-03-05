import type { DbPort, DbReadPort, DbReadQuery } from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { getRecordByExternalId } from './repos/bookingRecords.js';
import { findUserByChannelId, findUserByPhone, lookupUser } from './repos/userLookup.js';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
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
        case 'booking.byExternalId': {
          const recordId = asNonEmptyString(query.params.externalRecordId ?? query.params.recordId);
          if (!recordId) return null as T;
          return (await getRecordByExternalId(db, recordId)) as T;
        }
        default:
          return null as T;
      }
    },
  };
}
