/**
 * Constants for template keys used by the executor (admin, reminders).
 * Keeps keys in one place to avoid typos and simplify refactors.
 */
export const ADMIN = {
  REPLY_BUTTON: 'telegram:admin.reply.button',
  REPLY_SENT: 'telegram:admin.reply.sent',
  REPLY_CONTINUE_BUTTON: 'telegram:admin.reply.continueButton',
  DIALOG_CLOSE_BUTTON: 'telegram:admin.dialog.closeButton',
  DIALOG_CLOSED: 'telegram:admin.dialog.closed',
  DIALOGS_EMPTY: 'telegram:admin.dialogs.empty',
  DIALOGS_LIST: 'telegram:admin.dialogs.list',
  CONVERSATION_NEW_MESSAGE: 'telegram:admin.conversation.newMessage',
  CONVERSATION_SHOW: 'telegram:admin.conversation.show',
  QUESTIONS_EMPTY: 'telegram:admin.questions.empty',
  QUESTIONS_LIST: 'telegram:admin.questions.list',
  QUESTIONS_REPLY_BUTTON: 'telegram:admin.questions.replyButton',
  FORWARD: 'telegram:adminForward',
} as const;

export const REMINDER = {
  EXERCISE: 'telegram:reminder.exercise',
  WARMUP: 'telegram:reminder.warmup',
  BREATHING: 'telegram:reminder.breathing',
  WATER: 'telegram:reminder.water',
  SUPPLEMENTS_MEDICATION: 'telegram:reminder.supplements_medication',
} as const;

export const REMINDER_BY_CATEGORY: Record<string, string> = {
  exercise: REMINDER.EXERCISE,
  warmup: REMINDER.WARMUP,
  breathing: REMINDER.BREATHING,
  water: REMINDER.WATER,
  supplements_medication: REMINDER.SUPPLEMENTS_MEDICATION,
};
