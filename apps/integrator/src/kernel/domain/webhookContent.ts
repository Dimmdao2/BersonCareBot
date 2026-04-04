import type { NotificationSettings } from './ports/notifications.js';

/**
 * Minimal content shape for webhook handlers. Adapter passes this from integration layer
 * so domain does not depend on presentation layer.
 */
export type WebhookContent = {
  mainMenu: { ask: string; book: string; more: string };
  mainMenuKeyboard: unknown;
  requestContactKeyboard: unknown;
  bookingUrl: string;
  moreMenuInline: unknown;
  messages: {
    welcome: string;
    /** Onboarding copy (AUTH Stage 6 / S6.T06) — shown when phone is not linked. */
    onboardingWelcome: string;
    chooseMenu: string;
    describeQuestion: string;
    questionAccepted: string;
    notImplemented: string;
    bookingMy: string;
    confirmPhoneForBooking: string;
    bookingOpenPrompt: string;
    bookingOpenButton: string;
  };
  notificationSettings: { title: string; subtitle: string };
  buildNotificationKeyboard: (settings: NotificationSettings) => unknown;
};
