// Port for «отправить ответ» — implemented by adapters/telegram/client
export type MessagingPort = {
  sendMessage(params: {
    chat_id: number;
    text: string;
    reply_markup?: unknown;
  }): Promise<unknown>;
  editMessageText(params: {
    chat_id: number;
    message_id: number;
    text: string;
    reply_markup?: unknown;
  }): Promise<unknown>;
  editMessageReplyMarkup(params: {
    chat_id: number;
    message_id: number;
    reply_markup: unknown;
  }): Promise<unknown>;
  answerCallbackQuery(params: { callback_query_id: string }): Promise<unknown>;
};
