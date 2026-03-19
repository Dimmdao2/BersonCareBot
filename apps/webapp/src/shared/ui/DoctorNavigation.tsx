"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DOCTOR_NAV_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "overview", label: "Обзор", href: "/app/doctor" },
  { id: "clients", label: "Клиенты", href: "/app/doctor/clients" },
  { id: "appointments", label: "Записи", href: "/app/doctor/appointments" },
  { id: "messages", label: "Сообщения", href: "/app/doctor/messages" },
  { id: "broadcasts", label: "Рассылки", href: "/app/doctor/broadcasts" },
  { id: "stats", label: "Статистика", href: "/app/doctor/stats" },
  { id: "settings", label: "Настройки", href: "/app/settings" },
];

/** Навигация по разделам кабинета специалиста. Используется в layout /app/doctor. */
export function DoctorNavigation() {
  const pathname = usePathname();

  return (
    <nav id="doctor-main-nav" className="doctor-nav" aria-label="Разделы кабинета">
      <ul id="doctor-main-nav-list" className="doctor-nav__list">
        {DOCTOR_NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/app/doctor"
              ? pathname === "/app/doctor"
              : pathname.startsWith(item.href);
          return (
            <li key={item.id} id={`doctor-main-nav-item-${item.id}`} className="doctor-nav__item">
              <Link
                href={item.href}
                id={`doctor-main-nav-link-${item.id}`}
                className={`doctor-nav__link ${isActive ? "doctor-nav__link--active" : ""}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
