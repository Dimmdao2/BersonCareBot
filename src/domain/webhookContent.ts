import type { NotificationSettings } from './ports/notifications.js';

/**
 * Minimal content shape for webhook handlers. Adapter passes this from content/telegram
 * so domain does not depend on presentation layer.
 */
export type WebhookContent = {
  mainMenu: { ask: string; book: string; more: string };
  mainMenuKeyboard: unknown;
  moreMenuInline: unknown;
  messages: {
    welcome: string;
    chooseMenu: string;
    describeQuestion: string;
    questionAccepted: string;
    notImplemented: string;
    bookingMy: string;
  };
  notificationSettings: { title: string; subtitle: string };
  buildNotificationKeyboard: (settings: NotificationSettings) => unknown;
};
