/**
 * Проверка разрешённых типов сообщений для support relay по конфигу.
 */
import type { SupportRelayMessageType } from './supportRelayTypes.js';
import { isSupportRelayMessageType } from './supportRelayTypes.js';
import type { AppSettings } from '../../config/appSettings.js';
import { appSettings } from '../../config/appSettings.js';

export type SupportRelayPolicy = {
  isAllowedUserToAdmin(messageType: string): boolean;
  isAllowedAdminToUser(messageType: string): boolean;
};

function allowedSet(types: readonly SupportRelayMessageType[]): Set<string> {
  return new Set(types as readonly string[]);
}

export function createSupportRelayPolicy(settings: AppSettings['supportRelay']): SupportRelayPolicy {
  const userToAdmin = allowedSet(settings.allowedUserToAdminMessageTypes);
  const adminToUser = allowedSet(settings.allowedAdminToUserMessageTypes);

  return {
    isAllowedUserToAdmin(messageType: string): boolean {
      return isSupportRelayMessageType(messageType) && userToAdmin.has(messageType);
    },
    isAllowedAdminToUser(messageType: string): boolean {
      return isSupportRelayMessageType(messageType) && adminToUser.has(messageType);
    },
  };
}

export const defaultSupportRelayPolicy = createSupportRelayPolicy(appSettings.supportRelay);
