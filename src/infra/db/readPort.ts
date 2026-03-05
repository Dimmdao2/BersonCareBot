import type { DbReadPort, DbReadQuery } from '../../kernel/contracts/index.js';
import { findUserByChannelId, findUserByPhone, lookupUser } from './repos/userLookup.js';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function handleUserLookup<T = unknown>(query: DbReadQuery): Promise<T> {
  const resource = asNonEmptyString(query.params.resource);
  const by = asNonEmptyString(query.params.by);
  const value = asNonEmptyString(query.params.value);

  if (!resource || !by || !value) return null as T;

  return (await lookupUser(resource, by, value)) as T;
}

export function createDbReadPort(): DbReadPort {
  return {
    async readDb<T = unknown>(query: DbReadQuery): Promise<T> {
      switch (query.type) {
        case 'user.lookup':
          return handleUserLookup<T>(query);
        case 'user.byPhone': {
          const phone = asNonEmptyString(query.params.phoneNormalized);
          if (!phone) return null as T;
          return (await findUserByPhone(phone)) as T;
        }
        case 'user.byTelegramId': {
          const telegramId = asNonEmptyString(query.params.telegramId);
          if (!telegramId) return null as T;
          return (await findUserByChannelId('telegram', telegramId)) as T;
        }
        default:
          return null as T;
      }
    },
  };
}
