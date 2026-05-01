/**
 * Общая оболочка страницы приложения: верхняя панель и контент.
 * Для пациента (variant="patient" / "patient-wide") — {@link PatientTopNav} на всех ширинах;
 * заголовок экрана под полоской меню (кроме главной при `patientSuppressShellTitle`);
 * при `patientEmbedMain` / `patientHideBottomNav` / `patientBrandTitleBar` — классическая {@link PatientGatedHeader}.
 * Для кабинета врача (variant="doctor") — контейнер контента; шапка в `app/doctor/layout.tsx`.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { SessionUser } from "@/shared/types/session";
import { PatientGatedHeader } from "@/shared/ui/PatientGatedHeader";
import { PatientTopNav } from "@/shared/ui/PatientTopNav";
import { SectionHeading } from "@/components/common/typography/SectionHeading";
import { cn } from "@/lib/utils";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

type AppShellProps = {
  title: string;
  user: SessionUser | null;
  children: ReactNode;
  /** Ссылка «Назад» (например на главный экран пациента). */
  backHref?: string;
  backLabel?: string;
  /** Уменьшенный заголовок, когда есть кнопка «Назад». */
  titleSmall?: boolean;
  /**
   * Вариант оболочки.
   * - `patient` — patient shell (`max-w-[430px]`, `lg+` до `~1180px`), сверху {@link PatientTopNav} (primary nav).
   *   `patient-wide` — тот же layout (legacy alias).
   * - `doctor` — кабинет специалиста (широкий workspace).
   */
  variant?: "default" | "patient" | "patient-wide" | "doctor";
  /** Доп. плавающий UI для пациента. */
  patientFloatingSlot?: ReactNode;
  /**
   * Режим встраиваемого контента на всю ширину (например iframe записи): без зазора под шапкой,
   * компактный нижний отступ; нижняя навигация скрыта.
   */
  patientEmbedMain?: boolean;
  /** См. {@link PatientHeader}: скрыть «домой» на главную пациента. */
  patientHideHome?: boolean;
  /** См. {@link PatientHeader}: скрыть правые иконки шапки. */
  patientHideRightIcons?: boolean;
  /** См. {@link PatientHeader}: заголовок по центру (экраны входа). */
  patientBrandTitleBar?: boolean;
  /** См. {@link PatientHeader}: компактный бейдж рядом с заголовком (например «По подписке» на странице раздела). */
  patientTitleBadge?: string;
  /** Скрыть patient shell nav (экраны входа, iframe, brand bar): только {@link PatientGatedHeader}. */
  patientHideBottomNav?: boolean;
  /** Не показывать полоску заголовка под {@link PatientTopNav} (главная «Сегодня»). */
  patientSuppressShellTitle?: boolean;
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
  patientEmbedMain = false,
  patientHideHome = false,
  patientHideRightIcons = false,
  patientBrandTitleBar = false,
  patientTitleBadge,
  patientHideBottomNav = false,
  patientSuppressShellTitle = false,
}: AppShellProps) {
  if (variant === "patient" || variant === "patient-wide") {
    const showPatientShellNav = !patientEmbedMain && !patientHideBottomNav && !patientBrandTitleBar;
    const shellTitleBadge = patientTitleBadge?.trim() ?? "";
    const shellTitle = title?.trim() ?? "";
    const showShellTitleStrip =
      showPatientShellNav && !patientSuppressShellTitle && (Boolean(shellTitleBadge) || Boolean(shellTitle));
    return (
      <div
        id="app-shell-patient"
        className={cn(
          "mx-auto flex min-h-[100dvh] w-full flex-col bg-[var(--patient-page-bg)] pt-[max(0px,env(safe-area-inset-top,0px))]",
          patientEmbedMain
            ? "max-w-[480px] gap-0 pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
            : patientHideBottomNav
              ? "max-w-[430px] gap-3 pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] lg:max-w-[min(1180px,calc(100vw-2rem))]"
              : "max-w-[430px] safe-padding-patient gap-3 lg:max-w-[min(1180px,calc(100vw-2rem))]",
        )}
      >
        {showPatientShellNav ?
          <>
            <div className="z-50 shrink-0">
              <PatientTopNav backHref={backHref} backLabel={backLabel} />
            </div>
            {showShellTitleStrip ?
              <div
                data-testid="patient-shell-page-title-wrap"
                className="shrink-0 border-b border-[var(--patient-border)] bg-[var(--patient-surface)] px-4 py-2.5"
              >
                {shellTitleBadge ?
                  <span
                    data-testid="patient-header-title-badge"
                    className="inline-block max-w-full truncate rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-foreground"
                    title={shellTitleBadge}
                  >
                    {shellTitleBadge}
                  </span>
                : null}
                {shellTitle ?
                  <h1
                    className={cn(
                      "text-base font-semibold tracking-tight text-[var(--patient-text-primary)]",
                      shellTitleBadge && "mt-1.5",
                    )}
                  >
                    {shellTitle}
                  </h1>
                : null}
              </div>
            : null}
          </>
        : null}
        {showPatientShellNav ?
          null
        : <div data-testid="patient-gated-header-wrap">
            <PatientGatedHeader
              pageTitle={title}
              showBack={!!backHref}
              backHref={backHref}
              backLabel={backLabel}
              hideHome={patientHideHome}
              hideRightIcons={patientHideRightIcons}
              brandTitleBar={patientBrandTitleBar}
              titleBadge={patientTitleBadge}
            />
          </div>}
        <main
          id="app-shell-content"
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            patientEmbedMain ? "gap-0 pt-0" : "gap-[var(--patient-gap)] pt-1",
          )}
        >
          {children}
        </main>
        {patientFloatingSlot}
      </div>
    );
  }

  /** Кабинет врача: верхняя панель и «Настройки» — в `DoctorHeader` в `app/doctor/layout.tsx`. */
  if (variant === "doctor") {
    return (
      <div
        id="app-shell-doctor"
        className={DOCTOR_PAGE_CONTAINER_CLASS}
      >
        <main id="app-shell-content" className="flex flex-col gap-4">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div
      id="app-shell-default"
      className="mx-auto max-w-[600px] min-h-screen px-4 pb-12 pt-6"
    >
      <header
        id="app-shell-top-bar"
        className="mb-6 flex flex-col gap-4 rounded-[20px] border border-border/80 bg-card/95 px-5 py-5 shadow-sm backdrop-blur-md max-[720px]:items-start md:flex-row md:items-center md:justify-between"
      >
        <div>
          <div id="app-shell-title-row" className="flex items-center gap-4">
            {backHref ? (
              <Link href={backHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
                {backLabel}
              </Link>
            ) : null}
            <div>
              <SectionHeading level="eyebrow">BersonCare Platform</SectionHeading>
              <h1 className={titleSmall || backHref ? "text-xl font-semibold tracking-tight" : "text-[1.75rem] font-semibold leading-tight"}>
                {title}
              </h1>
            </div>
          </div>
        </div>
        <div id="app-shell-top-bar-actions" className="flex w-full flex-wrap items-center gap-3 max-[720px]:justify-between md:w-auto">
          {user ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm text-foreground">
              <span>{user.displayName}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{user.role}</span>
            </div>
          ) : null}
          <Link href="/app/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Настройки
          </Link>
        </div>
      </header>
      <main id="app-shell-content" className="flex flex-col gap-4">
        {children}
      </main>
    </div>
  );
}
