// src/types/telegram.ts
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