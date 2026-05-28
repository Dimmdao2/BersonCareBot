import type { AuthRegistrationEventType } from "@/modules/product-analytics/types";
import type { AuthRegistrationAuthMethod } from "@/app-layer/product-analytics/recordAuthRegistration";

const AUTH_METHOD_LABELS: Record<string, string> = {
  email_password: "Email и пароль",
  oauth_yandex: "Яндекс ID",
  oauth_google: "Google",
  oauth_apple: "Apple",
  phone_otp: "Телефон (код)",
  messenger_bind: "Привязка мессенджера",
  telegram_init: "Telegram",
  max_init: "MAX",
  integrator_exchange: "Обмен с integrator",
};

const STAGE_LABELS: Record<string, string> = {
  start: "Старт",
  challenge_sent: "Код отправлен",
  confirm: "Подтверждение",
  callback: "Callback",
  session_set: "Сессия",
};

const EVENT_TYPE_LABELS: Record<AuthRegistrationEventType, string> = {
  auth_register_failure: "Ошибка",
  auth_register_attempt: "Попытка",
  auth_register_success: "Успех",
};

const ERROR_CODE_LABELS: Record<string, string> = {
  db_error: "Ошибка БД",
  server_error: "Ошибка сервера",
  send_failed: "Не удалось отправить",
  delivery_failed: "Доставка не удалась",
  session_failed: "Сессия не создана",
  exchange_failed: "Обмен не выполнен",
  userinfo_failed: "Профиль провайдера",
  token_failed: "Токен провайдера",
  provider_error: "Ошибка провайдера",
  invalid_body: "Некорректные данные",
  invalid_code: "Неверный код",
  expired_code: "Код истёк",
  duplicate_email: "Email уже занят",
  access_denied: "Отменено пользователем",
  oauth_csrf: "CSRF OAuth",
  rate_limited: "Лимит запросов",
};

export function formatRegistrationAuthMethodLabel(raw: string): string {
  const key = raw.trim();
  if (!key || key === "—") return "—";
  return AUTH_METHOD_LABELS[key] ?? key;
}

export function formatRegistrationStageLabel(raw: string): string {
  const key = raw.trim();
  if (!key || key === "—") return "—";
  return STAGE_LABELS[key] ?? key;
}

export function formatRegistrationEventTypeLabel(eventType: AuthRegistrationEventType | ""): string {
  if (!eventType) return "Все типы";
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function formatRegistrationErrorCodeLabel(raw: string): string {
  const key = raw.trim();
  if (!key || key === "—") return "—";
  return ERROR_CODE_LABELS[key] ?? key;
}

export function formatRegistrationErrorClassLabel(raw: string): string {
  if (raw === "system") return "Системная";
  if (raw === "user") return "Пользовательская";
  return raw.trim() ? raw : "—";
}

export const REGISTRATION_AUTH_METHOD_FILTER_OPTIONS: { value: AuthRegistrationAuthMethod | ""; label: string }[] =
  [
    { value: "", label: "Все методы" },
    { value: "email_password", label: AUTH_METHOD_LABELS.email_password },
    { value: "oauth_yandex", label: AUTH_METHOD_LABELS.oauth_yandex },
    { value: "oauth_google", label: AUTH_METHOD_LABELS.oauth_google },
    { value: "oauth_apple", label: AUTH_METHOD_LABELS.oauth_apple },
    { value: "phone_otp", label: AUTH_METHOD_LABELS.phone_otp },
    { value: "messenger_bind", label: AUTH_METHOD_LABELS.messenger_bind },
    { value: "telegram_init", label: AUTH_METHOD_LABELS.telegram_init },
    { value: "max_init", label: AUTH_METHOD_LABELS.max_init },
    { value: "integrator_exchange", label: AUTH_METHOD_LABELS.integrator_exchange },
  ];

export const REGISTRATION_EVENT_TYPE_FILTER_OPTIONS: {
  value: AuthRegistrationEventType | "";
  label: string;
}[] = [
  { value: "auth_register_failure", label: EVENT_TYPE_LABELS.auth_register_failure },
  { value: "auth_register_attempt", label: EVENT_TYPE_LABELS.auth_register_attempt },
  { value: "auth_register_success", label: EVENT_TYPE_LABELS.auth_register_success },
  { value: "", label: "Все типы" },
];
