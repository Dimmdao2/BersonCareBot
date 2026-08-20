import { env } from '@/config/env';

/**
 * Оператор получает почту и пуши из трёх окружений в один ящик и не может различить их по письму
 * (владелец, 20.08). Единая точка вывода метки; источник — `APP_BASE_URL` (deployment identity, см.
 * `CONFIGURATION_ENV_VS_DATABASE.md`).
 *
 * Владелец, 20.08: «мне достаточно хоста (test или prod) или DEV — уж эту метку в дев можно поставить? не
 * усложнять главное». Поэтому здесь нет ни отдельной env-переменной, ни метки «неизвестно»: знакомый хост
 * даёт TEST/PROD, локальный — DEV, любой другой подставляется как есть — сам хост и есть ответ на вопрос
 * «откуда письмо».
 */

const KNOWN_HOSTS: Record<string, string> = {
  '127.0.0.1': 'DEV',
  localhost: 'DEV',
  '0.0.0.0': 'DEV',
  'test.bersoncare.ru': 'TEST',
  'bersoncare.ru': 'PROD',
};

export function computeOperatorAlertEnvLabel(appBaseUrl: string): string {
  let host: string;
  try {
    host = new URL(appBaseUrl).hostname.toLowerCase();
  } catch {
    // Разобрать нечего — так бывает только на локальной машине, где адрес не задан.
    return 'DEV';
  }
  return KNOWN_HOSTS[host] ?? host;
}

/**
 * Единственный чокпоинт разметки: метка — префикс, остальной текст темы не трогаем.
 * Идемпотентна: уже помеченная тема (например, повторно материализованный дайджест)
 * не получает второй `[LABEL]` — иначе на retry получили бы `[TEST] [TEST] ...`.
 */
export function stampOperatorAlertSubject(subject: string): string {
  const prefix = `[${computeOperatorAlertEnvLabel(env.APP_BASE_URL)}] `;
  return subject.startsWith(prefix) ? subject : `${prefix}${subject}`;
}
