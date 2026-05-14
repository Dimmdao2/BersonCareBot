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
  copyMessage(params: {
    chat_id: number;
    from_chat_id: number;
    message_id: number;
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
  deleteMessage(params: { chat_id: number; message_id: number }): Promise<unknown>;
  answerCallbackQuery(params: {
    callback_query_id: string;
    text?: string;
    show_alert?: boolean;
  }): Promise<unknown>;
};
