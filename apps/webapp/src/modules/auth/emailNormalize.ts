// Чистая нормализация email — без серверных зависимостей (config/env, node:crypto),
// чтобы клиентские компоненты могли её импортировать, не утаскивая в бандл весь
// emailAuth (а с ним dotenv → падение `process.stdout.isTTY` в браузере).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
