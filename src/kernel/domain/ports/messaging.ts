/** Parse mode for rich text (bold, links). HTML works in Telegram; other channels may convert or ignore. */
export type MessageParseMode = 'HTML' | 'Markdown';

/** Messaging transport port implemented by channel client adapters. */
export type MessagingPort = {
  sendMessage(params: {
    chat_id: number;
    text: string;
    reply_markup?: unknown;
    parse_mode?: MessageParseMode;
  }): Promise<unknown>;
  editMessageText(params: {
    chat_id: number;
    message_id: number;
    text: string;
    reply_markup?: unknown;
    parse_mode?: MessageParseMode;
  }): Promise<unknown>;
  editMessageReplyMarkup(params: {
    chat_id: number;
    message_id: number;
    reply_markup: unknown;
  }): Promise<unknown>;
  answerCallbackQuery(params: { callback_query_id: string }): Promise<unknown>;
};
