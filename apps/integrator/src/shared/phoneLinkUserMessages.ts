/** Нет строки `identities` для этого чата — рассинхрон или гонка; не путать с временной ошибкой БД. */
export function phoneLinkNoIntegratorIdentityUserMessage(source: string): string {
  if (source === 'telegram') {
    return 'Сессия бота не синхронизирована. Откройте мини-приложение из этого бота или отправьте /start, затем снова поделитесь контактом.';
  }
  return 'Сессия не синхронизирована. Откройте приложение из бота или начните диалог заново, затем снова поделитесь контактом.';
}

/** Нет строки в `user_channel_bindings` — сначала открыть мини-приложение из бота / пройти привязку канала. */
export function phoneLinkNoBindingUserMessage(source: string): string {
  if (source === 'telegram') {
    return 'Сначала откройте приложение из этого бота (кнопка меню), затем снова поделитесь контактом.';
  }
  return 'Сначала откройте приложение из бота, затем снова поделитесь контактом.';
}

/** Канон `platform_users.integrator_user_id` не совпадает с текущим пользователем бота — нужна поддержка. */
export function phoneLinkIntegratorMismatchUserMessage(source: string): string {
  if (source === 'telegram') {
    return 'Не удалось сопоставить аккаунт с приложением. Напишите в поддержку.';
  }
  return 'Не удалось сопоставить аккаунт. Напишите в поддержку.';
}

/** Конфликт: тот же номер уже закреплён за другим пользователем integrator (ON CONFLICT / тот же user). */
export function phoneLinkConflictUserMessage(source: string): string {
  if (source === 'telegram') {
    return 'Данный номер уже привязан к другому аккаунту Telegram. Напишите в поддержку для решения вопроса.';
  }
  return 'Данный номер уже привязан к другому аккаунту. Напишите в поддержку для решения вопроса.';
}

/** Транзиент БД / неопределённый сбой записи — не путать с конфликтом номера (`no_integrator_identity` — отдельный текст). */
export function phoneLinkSaveFailedUserMessage(): string {
  return 'Не удалось сохранить номер. Попробуйте позже или напишите в поддержку.';
}
