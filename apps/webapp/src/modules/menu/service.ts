/**
 * Меню главного экрана: список пунктов по роли пользователя.
 * Для врача — кабинет и настройки; для пациента — разделы контента из БД, кабинет, дневник.
 * Используется на странице /app/patient для отображения сетки карточек.
 */

import type { ContentSectionRow } from "@/infra/repos/pgContentSections";
import type { UserRole } from "@/shared/types/session";

export type MenuItem = {
  id: string;
  title: string;
  href: string;
  status: "available" | "locked" | "coming-soon";
};

export type GetMenuForRoleOptions = {
  /** Разделы из `content_sections` (видимые пациенту). */
  contentSections?: ContentSectionRow[];
};

/** Возвращает список пунктов меню в зависимости от роли (пациент или врач). */
export function getMenuForRole(role: UserRole, options?: GetMenuForRoleOptions): MenuItem[] {
  if (role === "doctor" || role === "admin") {
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

  const sectionItems: MenuItem[] = (options?.contentSections ?? []).map((s) => ({
    id: s.slug,
    title: s.title,
    href: `/app/patient/sections/${encodeURIComponent(s.slug)}`,
    status: "available" as const,
  }));

  return [
    ...sectionItems,
    { id: "cabinet", title: "Мои записи", href: "/app/patient/cabinet", status: "available" },
    // Единый «Дневник» (вкладки на `/app/patient/diary`); отдельная карточка ЛФК на главной не показывается (RAW §7).
    { id: "diary", title: "Дневник", href: "/app/patient/diary", status: "available" },
  ];
}
