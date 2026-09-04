/**
 * Текст, который автор кода СОЗНАТЕЛЬНО написал для показа человеку.
 *
 * Всё остальное — `Error` из драйвера базы, HTTP-клиента провайдера, рантайма Node или
 * стороннего пакета — по умолчанию считается небезопасным: его `message` может нести SQL,
 * значения параметров, имена таблиц и колонок, фрагменты payload пациента. Раньше слой
 * маршрутов и server actions не мог отличить одно от другого (`e instanceof Error ? e.message`)
 * и отдавал наружу любой текст. Отличие делается здесь — типом, а не догадкой по содержимому
 * строки: показать наружу можно только то, что помечено этим классом.
 */
export class UserFacingError extends Error {
  /** Тот же текст, что и `message`; отдельное поле переживает потерю прототипа при сериализации. */
  readonly userMessage: string;

  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options as ErrorOptions | undefined);
    this.name = 'UserFacingError';
    this.userMessage = userMessage;
  }
}

/** Текст для человека, если ошибка помечена как безопасная; иначе `undefined`. */
export function userFacingMessage(error: unknown): string | undefined {
  if (error instanceof UserFacingError) return error.userMessage;
  return undefined;
}

/**
 * Единственный способ получить строку для показа человеку из произвольного `unknown`:
 * помеченный текст либо фиксированный fallback. Произвольный `Error.message` не проходит.
 */
export function safeUserMessage(error: unknown, fallback: string): string {
  return userFacingMessage(error) ?? fallback;
}
