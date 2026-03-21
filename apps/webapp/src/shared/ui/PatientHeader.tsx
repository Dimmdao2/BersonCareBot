"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const MENU_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "profile", label: "Мой профиль", href: "/app/patient/profile" },
  { id: "cabinet", label: "Мои записи", href: "/app/patient/cabinet" },
  { id: "notifications", label: "Настройки уведомлений", href: "/app/patient/notifications" },
];

type PatientHeaderProps = {
  /** Показывать кнопку «Назад» (история браузера через router.back). */
  showBack?: boolean;
  /** Зарезервировано для будущего fallback; навигация назад — всегда router.back(). */
  backHref?: string;
  /** Текст/aria-label для кнопки «Назад». */
  backLabel?: string;
};

/** Шапка пациента: стрелка назад | заголовок (ссылка в меню) | гамбургер (боковое меню справа). */
export function PatientHeader({ showBack, backLabel = "Назад" }: PatientHeaderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const goBack = useCallback(() => {
    router.back();
  }, [router]);

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

  useEffect(() => {
    queueMicrotask(() => {
      setIsTelegramMiniApp(!!window.Telegram?.WebApp);
    });
  }, []);

  return (
    <header id="patient-header" className="patient-header" data-open={open}>
      <div id="patient-header-row" className="patient-header__row">
        <div className="patient-header__left">
          {showBack ? (
            <button
              type="button"
              className="patient-header__back"
              onClick={goBack}
              aria-label={backLabel}
            >
              <span className="patient-header__back-icon" aria-hidden>←</span>
            </button>
          ) : (
            <span className="patient-header__back-placeholder" aria-hidden />
          )}
        </div>
        <div className="patient-header__center">
          <Link href="/app/patient" className="patient-header__home-link" prefetch={false} aria-label="Главное меню">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </Link>
        </div>
        <div className="patient-header__right">
          <button
            type="button"
            id="patient-menu-toggle"
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

      <div
        id="patient-menu-overlay"
        className="drawer-overlay"
        aria-hidden={!open}
        onClick={close}
        tabIndex={-1}
      />
      <aside id="patient-menu-drawer" className="drawer-panel" role="dialog" aria-label="Меню" aria-modal="true">
        <div className="drawer-panel__header">
          <button type="button" className="drawer-panel__close" onClick={close} aria-label="Закрыть">
            ×
          </button>
        </div>
        <nav id="patient-menu-nav" className="drawer-nav">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.id}
              id={`patient-menu-link-${item.id}`}
              href={item.href}
              className="drawer-nav__link"
              onClick={close}
            >
              {item.label}
            </Link>
          ))}
          {!isTelegramMiniApp && (
            <>
              <div className="drawer-nav__divider" />
              <button
                type="button"
                id="patient-menu-logout"
                className="drawer-nav__link drawer-nav__link--danger"
                onClick={() => {
                  close();
                  window.location.href = "/api/auth/logout";
                }}
              >
                Выйти
              </button>
            </>
          )}
        </nav>
      </aside>
    </header>
  );
}
