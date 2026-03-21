/**
 * Общая оболочка страницы приложения: верхняя панель и контент.
 * Используется на всех страницах после входа: пациент, врач, настройки. В шапке — заголовок,
 * опционально кнопка «Назад», имя и роль пользователя, ссылка «Настройки». Контент страницы
 * передаётся в children. Отображается везде внутри /app (кроме корневого layout).
 * Для пациента (variant="patient") — своя шапка: назад | BERSONCARE | гамбургер-меню справа.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/shared/types/session";
import { PatientHeader } from "@/shared/ui/PatientHeader";
import { AskQuestionFAB } from "@/shared/ui/AskQuestionFAB";

type AppShellProps = {
  title: string;
  user: SessionUser | null;
  children: ReactNode;
  /** Ссылка «Назад» (например на главный экран пациента). */
  backHref?: string;
  backLabel?: string;
  /** Уменьшенный заголовок, когда есть кнопка «Назад». */
  titleSmall?: boolean;
  /** Вариант шапки: по умолчанию — заголовок и действия; patient — стрелка назад, BERSONCARE, гамбургер; doctor — широкий layout. */
  variant?: "default" | "patient" | "doctor";
};

/** Рендерит контейнер приложения, шапку с заголовком и действиями и основной контент. */
export function AppShell({
  title,
  user,
  children,
  backHref,
  backLabel = "Меню",
  titleSmall,
  variant = "default",
}: AppShellProps) {
  if (variant === "patient") {
    return (
      <div id="app-shell-patient" className="app-shell app-shell--patient">
        <PatientHeader
          showBack={!!backHref}
          backHref={backHref}
          backLabel={backLabel}
        />
        <main id="app-shell-content" className="content-area">
          {title ? <h1 className="page-title">{title}</h1> : null}
          {children}
        </main>
        <AskQuestionFAB visible={user !== null} />
      </div>
    );
  }

  const isDoctor = variant === "doctor";
  return (
    <div
      id={isDoctor ? "app-shell-doctor" : "app-shell-default"}
      className={`app-shell ${isDoctor ? "app-shell--doctor" : ""} ${!isDoctor && titleSmall ? "app-shell--title-small" : ""}`}
    >
      <header id="app-shell-top-bar" className="top-bar">
        <div>
          <div id="app-shell-title-row" className="top-bar__title-row">
            {backHref ? (
              <Link href={backHref} className="button button--back">
                {backLabel}
              </Link>
            ) : null}
            <div>
              <div className="eyebrow">BersonCare Platform</div>
              <h1 className={backHref ? "top-bar__h1--with-back" : undefined}>{title}</h1>
            </div>
          </div>
        </div>
        <div id="app-shell-top-bar-actions" className="top-bar__actions">
          {user ? (
            <div className="user-pill">
              <span>{user.displayName}</span>
              <span className="user-pill__role">{user.role}</span>
            </div>
          ) : null}
          <Link href="/app/settings" className="button button--ghost">
            Настройки
          </Link>
        </div>
      </header>
      <main id="app-shell-content" className="content-area">
        {children}
      </main>
    </div>
  );
}
