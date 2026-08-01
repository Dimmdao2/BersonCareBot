/**
 * Значение настройки живёт в базе. Если база не ответила или строки нет — у нас НЕТ ответа, и
 * подставлять вместо него константу из исходника нельзя: подстановка меняет поведение системы
 * молча. Решение владельца 01.08 дословно: «База моргнула — мы ничего не требуем. Мы просто не
 * пускаем пока не поднимется».
 *
 * Почему именно так, а не «на всякий случай построже»: включённый вслепую второй фактор запирает
 * весь персонал, у кого он не настроен (инцидент 25.07, см. комментарий в
 * `app-layer/guards/requireRole.ts`). Мы не ужесточаем правило и не смягчаем его — мы не отвечаем.
 */
export class RuntimeSettingUnavailableError extends Error {
  readonly settingKey: string;

  constructor(settingKey: string, cause?: unknown) {
    super(`runtime_setting_unavailable:${settingKey}`, cause === undefined ? undefined : { cause });
    this.name = 'RuntimeSettingUnavailableError';
    this.settingKey = settingKey;
  }
}

export function isRuntimeSettingUnavailable(error: unknown): error is RuntimeSettingUnavailableError {
  return error instanceof RuntimeSettingUnavailableError;
}
