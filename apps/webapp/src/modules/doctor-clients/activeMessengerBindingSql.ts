/** Active messenger binding: row exists and user has not blocked the bot. */
export function sqlActiveTelegramBinding(userIdExpr: string): string {
  return `EXISTS (
    SELECT 1 FROM user_channel_bindings ucb
    WHERE ucb.user_id = ${userIdExpr}
      AND ucb.channel_code = 'telegram'
      AND ucb.bot_blocked_at IS NULL
  )`;
}

export function sqlActiveMaxBinding(userIdExpr: string): string {
  return `EXISTS (
    SELECT 1 FROM user_channel_bindings ucb
    WHERE ucb.user_id = ${userIdExpr}
      AND ucb.channel_code = 'max'
      AND ucb.bot_blocked_at IS NULL
  )`;
}

export function sqlActiveMessengerBinding(userIdExpr: string): string {
  return `EXISTS (
    SELECT 1 FROM user_channel_bindings ucb
    WHERE ucb.user_id = ${userIdExpr}
      AND ucb.channel_code IN ('telegram', 'max')
      AND ucb.bot_blocked_at IS NULL
  )`;
}

export function sqlMessengerBotBlocked(userIdExpr: string, channel: "telegram" | "max"): string {
  return `EXISTS (
    SELECT 1 FROM user_channel_bindings ucb
    WHERE ucb.user_id = ${userIdExpr}
      AND ucb.channel_code = '${channel}'
      AND ucb.bot_blocked_at IS NOT NULL
  )`;
}
