import type { ChannelUserFrom as ContractChannelUserFrom } from '../contracts/ports.js';

/** Core transport and action types used by legacy adapters. */
export type ChannelUserFrom = ContractChannelUserFrom;

export type ChannelChat = { id: number };

export type ChannelMessage = {
  message_id?: number;
  text?: string;
  from?: ChannelUserFrom;
  chat?: ChannelChat;
  contact?: {
    phone_number: string;
    user_id?: number;
    first_name?: string;
    last_name?: string;
  };
};

export type ChannelCallbackQuery = {
  id: string;
  from: ChannelUserFrom;
  data?: string;
  message?: ChannelMessage;
};

export type ChannelWebhookBody = {
  update_id?: number;
  message?: ChannelMessage;
  callback_query?: ChannelCallbackQuery;
};

/** Тип сообщения для support relay (user↔admin). Заполняется интеграцией (e.g. Telegram). */
export type IncomingMessageUpdate = {
  kind: 'message';
  chatId: number;
  channelId: string;
  messageId?: number | string;
  text: string;
  action?: string;
  phone?: string;
  contactPhone?: string;
  hasLinkedPhone?: boolean;
  channelUsername?: string | null;
  channelFirstName?: string | null;
  channelLastName?: string | null;
  userRow: { id: string; channel_id: string } | null;
  userState: string;
  adminForward?: { chatId: number; text: string } | undefined;
  /** Тип сообщения для relay (text, photo, document, …). Определяется интеграцией. */
  relayMessageType?: string;
};

export type IncomingCallbackUpdate = {
  kind: 'callback';
  chatId: number;
  messageId: number | string;
  channelUserId: number;
  action?: string;
  hasLinkedPhone?: boolean;
  channelUsername?: string | null;
  channelFirstName?: string | null;
  channelLastName?: string | null;
  callbackData: string;
  callbackQueryId: string;
  conversationId?: string;
  /** Parsed from diary.symptom.select:id, diary.symptom.value:id:n, diary.symptom.entryType:id:n:type, diary.lfk.select:id, diary.lfk.session:id */
  trackingId?: string;
  value?: number;
  entryType?: string;
  complexId?: string;
};

/** Transport-agnostic incoming update shape used in connector mappers. */
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
  messageId: number | string;
  text: string;
  replyMarkup?: unknown;
};

export type EditMessageReplyMarkupAction = {
  type: 'editMessageReplyMarkup';
  chatId: number;
  messageId: number | string;
  replyMarkup: unknown;
};

export type AnswerCallbackQueryAction = {
  type: 'answerCallbackQuery';
  callbackQueryId: string;
};

/** Transport-agnostic outgoing action shape used in connector mappers. */
export type OutgoingAction =
  | SendMessageAction
  | EditMessageTextAction
  | EditMessageReplyMarkupAction
  | AnswerCallbackQueryAction;
