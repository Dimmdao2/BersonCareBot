/**
 * Composition root: build dependencies for app (health, webhook).
 * Services layer is bypassed — repos and client used directly.
 */
import { healthCheckDb } from '../db/client.js';
import { userPort, notificationsPort } from '../db/repos/telegramUsers.js';
import { logger } from '../observability/logger.js';
import { createSmscStub } from '../integrations/smsc/stub.js';
import type { SmsClient } from '../integrations/smsc/types.js';

export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  userPort: typeof userPort;
  notificationsPort: typeof notificationsPort;
  smsClient: SmsClient;
};

export function buildDeps(): AppDeps {
  return {
    healthCheckDb,
    userPort,
    notificationsPort,
    smsClient: createSmscStub(logger),
  };
}
