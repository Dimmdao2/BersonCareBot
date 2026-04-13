/** Конфликт: тот же номер уже закреплён за другим пользователем integrator (ON CONFLICT / тот же user). */
export function phoneLinkConflictUserMessage(source: string): string {
  if (source === 'telegram') {
    return 'Данный номер уже привязан к другому аккаунту Telegram. Напишите в поддержку для решения вопроса.';
  }
  return 'Данный номер уже привязан к другому аккаунту. Напишите в поддержку для решения вопроса.';
}

/** Ошибка БД, отсутствие identity или сбой порта записи — не путать с конфликтом номера. */
export function phoneLinkSaveFailedUserMessage(): string {
  return 'Не удалось сохранить номер. Попробуйте позже или напишите в поддержку.';
}
