/**
 * Composition root: build dependencies for app (health, webhook).
 * Services layer is bypassed — repos and client used directly.
 */
import { healthCheckDb } from '../db/client.js';
import { userPort, notificationsPort } from '../db/repos/telegramUsers.js';

export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  userPort: typeof userPort;
  notificationsPort: typeof notificationsPort;
};

export function buildDeps(): AppDeps {
  return {
    healthCheckDb,
    userPort,
    notificationsPort,
  };
}
