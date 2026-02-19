export type SubscriptionsKeyboardRow = {
  topicId: number;
  title: string;
  enabled: boolean;
};

type InlineKeyboardButton = { text: string; callback_data: string };
type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] };

export function buildSubscriptionsKeyboard(
  rows: SubscriptionsKeyboardRow[],
): InlineKeyboardMarkup {
  return {
    inline_keyboard: rows.map((r) => [
      {
        text: `${r.enabled ? "✅" : "-"} ${r.title}`,
        callback_data: `sub:toggle:${r.topicId}`,
      },
    ]),
  };
}
