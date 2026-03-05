import type { DbReadPort, DbReadQuery } from '../../kernel/contracts/index.js';
import { findByPhone, getTelegramUserLinkData } from './repos/telegramUsers.js';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function handleUserLookup<T = unknown>(query: DbReadQuery): Promise<T> {
  const resource = asNonEmptyString(query.params.resource);
  const by = asNonEmptyString(query.params.by);
  const value = asNonEmptyString(query.params.value);

  if (!resource || !by || !value) return null as T;

  if (resource === 'telegram' && by === 'phone') {
    return (await findByPhone(value)) as T;
  }

  if (resource === 'telegram' && by === 'telegramId') {
    return (await getTelegramUserLinkData(value)) as T;
  }

  return null as T;
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
          return (await findByPhone(phone)) as T;
        }
        case 'user.byTelegramId': {
          const telegramId = asNonEmptyString(query.params.telegramId);
          if (!telegramId) return null as T;
          return (await getTelegramUserLinkData(telegramId)) as T;
        }
        default:
          return null as T;
      }
    },
  };
}
