/**
 * Меню главного экрана: список пунктов по роли пользователя.
 * Для врача — кабинет и настройки; для пациента — покупки, скорая помощь, уроки, дневники и т.д.
 * Используется на странице /app/patient для отображения сетки карточек.
 */

import type { UserRole } from "@/shared/types/session";

export type MenuItem = {
  id: string;
  title: string;
  href: string;
  status: "available" | "locked" | "coming-soon";
};

/** Возвращает список пунктов меню в зависимости от роли (пациент или врач). */
export function getMenuForRole(role: UserRole): MenuItem[] {
  if (role === "doctor") {
    return [
      {
        id: "doctor-workspace",
        title: "Кабинет специалиста",
        href: "/app/doctor",
        status: "available",
      },
      {
        id: "doctor-settings",
        title: "Настройки",
        href: "/app/settings",
        status: "available",
      },
    ];
  }

  return [
    { id: "purchases", title: "Мои покупки", href: "/app/patient/purchases", status: "available" },
    { id: "emergency", title: "Скорая помощь", href: "/app/patient/emergency", status: "available" },
    { id: "lessons", title: "Полезные уроки", href: "/app/patient/lessons", status: "available" },
    { id: "symptoms", title: "Дневник симптомов", href: "/app/patient/diary/symptoms", status: "available" },
    { id: "lfk", title: "Дневник ЛФК", href: "/app/patient/diary/lfk", status: "available" },
    { id: "assistant", title: "Персональный помощник", href: "/app/settings", status: "coming-soon" },
  ];
}
