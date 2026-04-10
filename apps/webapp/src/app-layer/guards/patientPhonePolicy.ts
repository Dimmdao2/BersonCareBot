/**
 * Единая политика: для пациента с сессией без привязанного телефона закрыты все маршруты
 * под `/app/patient/*`, кроме явного allowlist (главное меню, привязка, профиль, публичные разделы).
 * Проверка на сервере: `app/app/patient/layout.tsx` + API / server actions.
 */

/** Пути, доступные пациенту без `platform_users.phone_normalized` (гость или ждём привязку). */
const PREFIX_ALLOWLIST = [
  "/app/patient/bind-phone",
  "/app/patient/profile",
  "/app/patient/sections/", // уроки, скорая и т.п.
  "/app/patient/content/",
  "/app/patient/help",
  "/app/patient/install",
  "/app/patient/address",
  /** Редирект на sections/lessons — не требовать телефон на промежуточном URL. */
  "/app/patient/lessons",
] as const;

/**
 * Нужен ли непустой нормализованный телефон для данного pathname (без query).
 * Пустой pathname → false (middleware не передал заголовок — не блокируем).
 */
export function patientPathRequiresBoundPhone(pathname: string): boolean {
  if (!pathname || !pathname.startsWith("/app/patient")) {
    return false;
  }
  let path = pathname.replace(/\/+$/, "");
  if (!path) path = "/";
  if (path === "/app/patient") {
    return false;
  }
  for (const prefix of PREFIX_ALLOWLIST) {
    if (path === prefix || path.startsWith(prefix)) {
      return false;
    }
  }
  return true;
}
