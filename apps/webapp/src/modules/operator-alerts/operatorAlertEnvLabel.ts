import { env } from '@/config/env';

/**
 * Оператор получает почту/пуши из трёх окружений (DEV/TEST/PROD) в один ящик и не может
 * различить их по письму (владелец, 20.08). Единая точка вывода метки: честный источник —
 * `APP_BASE_URL` (deployment identity, см. `CONFIGURATION_ENV_VS_DATABASE.md`), явный
 * override — на случай, когда хост неинформативен (например, локальный туннель).
 *
 * Нераспознанный хост обязан вернуть честную метку С ХОСТОМ ВНУТРИ, а не тихо стать "PROD".
 */

const KNOWN_HOSTS: Record<string, string> = {
  '127.0.0.1': 'DEV',
  localhost: 'DEV',
  'test.bersoncare.ru': 'TEST',
  'bersoncare.ru': 'PROD',
};

export function computeOperatorAlertEnvLabel(input: {
  appBaseUrl: string;
  override?: string;
}): string {
  const override = (input.override ?? '').trim();
  if (override) return override;
  let host: string;
  try {
    host = new URL(input.appBaseUrl).hostname.toLowerCase();
  } catch {
    return `unknown(${input.appBaseUrl.trim() || 'empty'})`;
  }
  return KNOWN_HOSTS[host] ?? `unknown(${host})`;
}

/** Явный override, когда хост из `APP_BASE_URL` неинформативен. По умолчанию не задан. */
export function resolveOperatorAlertEnvLabel(): string {
  return computeOperatorAlertEnvLabel({
    appBaseUrl: env.APP_BASE_URL,
    override: process.env.OPERATOR_ALERT_ENV_LABEL,
  });
}

/** Единственный чокпоинт разметки: метка — префикс, остальной текст темы не трогаем. */
export function stampOperatorAlertSubject(subject: string): string {
  return `[${resolveOperatorAlertEnvLabel()}] ${subject}`;
}
