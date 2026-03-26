/**
 * Общая оболочка страницы приложения: верхняя панель и контент.
 * Используется на всех страницах после входа: пациент, врач, настройки. В шапке — заголовок,
 * опционально кнопка «Назад», имя и роль пользователя, ссылка «Настройки». Контент страницы
 * передаётся в children. Отображается везде внутри /app (кроме корневого layout).
 * Для пациента (variant="patient") — PatientHeader: назад, домой, заголовок, меню (Sheet).
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { SessionUser } from "@/shared/types/session";
import { PatientHeader } from "@/shared/ui/PatientHeader";
import { AskQuestionFAB } from "@/shared/ui/AskQuestionFAB";
import { PatientQuickAddFAB } from "@/app/app/patient/components/PatientQuickAddFAB";
import { cn } from "@/lib/utils";

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
  /** Доп. плавающий UI для пациента (например QuickAdd на дневнике). */
  patientFloatingSlot?: ReactNode;
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
  patientFloatingSlot,
}: AppShellProps) {
  if (variant === "patient") {
    return (
      <div
        id="app-shell-patient"
        className="app-shell--patient mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-5"
      >
        <PatientHeader
          pageTitle={title}
          showBack={!!backHref}
          backHref={backHref}
          backLabel={backLabel}
        />
        <main
          id="app-shell-content"
          className="content-area flex min-h-0 flex-1 flex-col"
        >
          {children}
        </main>
        {patientFloatingSlot}
        <PatientQuickAddFAB visible={user !== null} />
        <AskQuestionFAB visible={user !== null} />
      </div>
    );
  }

  /** Кабинет врача: верхняя панель и «Настройки» — в `DoctorHeader` в `app/doctor/layout.tsx`. */
  if (variant === "doctor") {
    return (
      <div
        id="app-shell-doctor"
        className="app-shell app-shell--doctor mx-auto w-full max-w-7xl px-3 pb-8 md:px-4"
      >
        <main id="app-shell-content" className="content-area">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div
      id="app-shell-default"
      className={`app-shell ${titleSmall ? "app-shell--title-small" : ""}`}
    >
      <header id="app-shell-top-bar" className="top-bar">
        <div>
          <div id="app-shell-title-row" className="top-bar__title-row">
            {backHref ? (
              <Link
                href={backHref}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "button--back shrink-0")}
              >
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
          <Link href="/app/settings" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
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
