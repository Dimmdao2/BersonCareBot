/**
 * Composition root: build dependencies for app (health, webhook).
 * Services layer is bypassed — repos and client used directly.
 */
import { healthCheckDb } from '../db/client.js';
import {
  userPort,
  notificationsPort,
  findByPhone,
  getTelegramUserLinkData,
  setTelegramUserPhone,
} from '../db/repos/telegramUsers.js';
import { insertEvent, upsertRecord, getRecordByRubitimeId } from '../db/repos/rubitimeRecords.js';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import { createSmscStub } from '../integrations/smsc/stub.js';
import type { SmsClient } from '../integrations/smsc/types.js';

export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  userPort: typeof userPort;
  notificationsPort: typeof notificationsPort;
  smsClient: SmsClient;
  findTelegramUserByPhone: typeof findByPhone;
  insertRubitimeEvent: typeof insertEvent;
  upsertRubitimeRecord: typeof upsertRecord;
  getRubitimeRecordById: typeof getRecordByRubitimeId;
  getTelegramUserLinkData: typeof getTelegramUserLinkData;
  setTelegramUserPhone: typeof setTelegramUserPhone;
};

export function buildDeps(): AppDeps {
  const smsClient: SmsClient = env.SMSC_ENABLED
    ? env.SMSC_API_KEY
      ? createSmscClient({
        apiKey: env.SMSC_API_KEY,
        baseUrl: env.SMSC_API_BASE_URL,
        log: logger,
      })
      : createSmscStub(logger)
    : createSmscStub(logger);

  if (env.SMSC_ENABLED && !env.SMSC_API_KEY) {
    logger.warn({ smscEnabled: env.SMSC_ENABLED }, 'smsc enabled but api key is not set, using stub');
  }

  return {
    healthCheckDb,
    userPort,
    notificationsPort,
    smsClient,
    findTelegramUserByPhone: findByPhone,
    insertRubitimeEvent: insertEvent,
    upsertRubitimeRecord: upsertRecord,
    getRubitimeRecordById: getRecordByRubitimeId,
    getTelegramUserLinkData,
    setTelegramUserPhone,
  };
}
