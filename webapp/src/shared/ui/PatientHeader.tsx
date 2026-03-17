"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const MENU_ITEMS: { label: string; href: string }[] = [
  { label: "Профиль", href: "/app/patient/cabinet" },
  { label: "Безопасность", href: "/app/settings" },
  { label: "Настройки уведомлений", href: "/app/settings" },
  { label: "Связь с поддержкой", href: "/app/patient/emergency" },
  { label: "Справка", href: "/app/settings" },
];

type PatientHeaderProps = {
  /** Ссылка «Назад»; если не передана, стрелка не показывается (главное меню). */
  backHref?: string;
};

/** Шапка пациента: стрелка назад | BERSONCARE (в меню) | гамбургер (боковое меню справа). */
export function PatientHeader({ backHref }: PatientHeaderProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

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
          {backHref ? (
            <Link href={backHref} className="patient-header__back" aria-label="Назад">
              <span className="patient-header__back-icon" aria-hidden>←</span>
            </Link>
          ) : (
            <span className="patient-header__back-placeholder" aria-hidden />
          )}
        </div>
        <div className="patient-header__center">
          <Link href="/app/patient" className="patient-header__title">
            BERSONCARE
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
            <Link key={item.href} href={item.href} className="drawer-nav__link" onClick={close}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </header>
  );
}
