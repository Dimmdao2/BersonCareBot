// Re-export domain/transport types (single place for core types)
export type TelegramUserFrom = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export type TelegramChat = { id: number };

export type TelegramMessage = {
  message_id?: number;
  text?: string;
  from?: TelegramUserFrom;
  chat?: TelegramChat;
  contact?: {
    phone_number: string;
    user_id?: number;
    first_name?: string;
    last_name?: string;
  };
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUserFrom;
  data?: string;
  message?: TelegramMessage;
};

export type TelegramWebhookBody = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

// --- internal update/action types (transport-agnostic) ---

export type IncomingMessageUpdate = {
  kind: 'message';
  chatId: number;
  telegramId: string;
  text: string;
  contactPhone?: string;
  telegramUsername?: string | null;
  userRow: { id: string; telegram_id: string } | null;
  userState: string;
  /** When user is in waiting_for_question and we have admin target */
  adminForward?: { chatId: number; text: string } | undefined;
};

export type IncomingCallbackUpdate = {
  kind: 'callback';
  chatId: number;
  messageId: number;
  telegramId: number;
  callbackData: string;
  callbackQueryId: string;
};

export type IncomingUpdate = IncomingMessageUpdate | IncomingCallbackUpdate;

export type SendMessageAction = {
  type: 'sendMessage';
  chatId: number;
  text: string;
  replyMarkup?: unknown;
};

export type EditMessageTextAction = {
  type: 'editMessageText';
  chatId: number;
  messageId: number;
  text: string;
  replyMarkup?: unknown;
};

export type EditMessageReplyMarkupAction = {
  type: 'editMessageReplyMarkup';
  chatId: number;
  messageId: number;
  replyMarkup: unknown;
};

export type AnswerCallbackQueryAction = {
  type: 'answerCallbackQuery';
  callbackQueryId: string;
};

export type OutgoingAction =
  | SendMessageAction
  | EditMessageTextAction
  | EditMessageReplyMarkupAction
  | AnswerCallbackQueryAction;
