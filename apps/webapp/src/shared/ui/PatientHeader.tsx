"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const MENU_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "cabinet", label: "Профиль", href: "/app/patient/cabinet" },
  { id: "security", label: "Безопасность", href: "/app/settings" },
  { id: "notifications", label: "Настройки уведомлений", href: "/app/settings" },
  { id: "emergency", label: "Связь с поддержкой", href: "/app/patient/emergency" },
  { id: "help", label: "Справка", href: "/app/settings" },
];

type PatientHeaderProps = {
  /** Показывать кнопку «Назад». Если передан backHref — ссылка на него, иначе router.back(). */
  showBack?: boolean;
  /** Куда ведёт кнопка «Назад» (например /app/patient). */
  backHref?: string;
  /** Текст/aria-label для кнопки «Назад». */
  backLabel?: string;
  /** Заголовок страницы (отображается по центру и ведёт в меню). Если не передан — «BERSONCARE». */
  title?: string;
};

/** Шапка пациента: стрелка назад | заголовок (ссылка в меню) | гамбургер (боковое меню справа). */
export function PatientHeader({ showBack, backHref, backLabel = "Назад", title }: PatientHeaderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const goBack = useCallback(() => {
    if (backHref) router.push(backHref);
    else router.back();
  }, [router, backHref]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) document.body.classList.add("drawer-open");
    else document.body.classList.remove("drawer-open");
    return () => document.body.classList.remove("drawer-open");
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [close]);

  return (
    <header className="patient-header" data-open={open}>
      <div className="patient-header__row">
        <div className="patient-header__left">
          {showBack ? (
            backHref ? (
              <Link
                href={backHref}
                className="patient-header__back"
                aria-label={backLabel}
              >
                <span className="patient-header__back-icon" aria-hidden>←</span>
              </Link>
            ) : (
              <button
                type="button"
                className="patient-header__back"
                onClick={goBack}
                aria-label={backLabel}
              >
                <span className="patient-header__back-icon" aria-hidden>←</span>
              </button>
            )
          ) : (
            <span className="patient-header__back-placeholder" aria-hidden />
          )}
        </div>
        <div className="patient-header__center">
          <Link href="/app/patient" className="patient-header__title" prefetch={false}>
            {title?.trim() ?? "BERSONCARE"}
          </Link>
        </div>
        <div className="patient-header__right">
          <button
            type="button"
            className="patient-header__menu-btn"
            onClick={toggle}
            aria-label="Меню"
            aria-expanded={open}
          >
            <span className="patient-header__hamburger" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div className="drawer-overlay" aria-hidden={!open} onClick={close} tabIndex={-1} />
      <aside className="drawer-panel" role="dialog" aria-label="Меню" aria-modal="true">
        <div className="drawer-panel__header">
          <button type="button" className="drawer-panel__close" onClick={close} aria-label="Закрыть">
            ×
          </button>
        </div>
        <nav className="drawer-nav">
          {MENU_ITEMS.map((item) => (
            <Link key={item.id} href={item.href} className="drawer-nav__link" onClick={close}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </header>
  );
}
