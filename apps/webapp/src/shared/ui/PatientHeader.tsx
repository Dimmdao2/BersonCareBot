"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  Bell,
  ChevronLeft,
  Home,
  Menu,
  MessageCircle,
  User,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientNavByPlatform,
  type HeaderIconId,
} from "@/app-layer/routes/navigation";
import { cn } from "@/lib/utils";
import { usePlatform } from "@/shared/hooks/usePlatform";
import { useReminderUnreadCount } from "@/shared/hooks/useReminderUnread";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";
import { shareCabinetLink } from "@/shared/lib/shareCabinetLink";

/** Единый стиль пунктов бокового меню (Sheet). */
const SHEET_NAV_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 font-normal",
);

/** Touch target ≥ 44px (WCAG); `size="icon"` в дизайн-системе = 32px — переопределяем. */
const HEADER_ICON_CLASS = cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10 shrink-0");


type PatientHeaderProps = {
  /** Заголовок экрана в шапке (не дублировать в main). */
  pageTitle: string;
  showBack?: boolean;
  backHref?: string;
  backLabel?: string;
  /** Не показывать ссылку на главную пациента (экран входа и публичная поддержка). */
  hideHome?: boolean;
  /** Скрыть правые иконки (настройки и т.д.), оставить только заголовок и «Назад». */
  hideRightIcons?: boolean;
  /** Заголовок по центру экрана (экраны входа): «назад»/«домой» слева, иконки справа, без смещения заголовка. */
  brandTitleBar?: boolean;
  /** Компактный бейдж под/над заголовком (например подписочный текст из CMS item). */
  titleBadge?: string;
};

export function PatientHeader({
  pageTitle,
  showBack,
  backHref,
  backLabel = "Назад",
  hideHome = false,
  hideRightIcons = false,
  brandTitleBar = false,
  titleBadge,
}: PatientHeaderProps) {
  const router = useRouter();
  const platform = usePlatform();
  const nav = patientNavByPlatform[platform];
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRightIds = hideRightIcons ? [] : nav.headerRightIcons;
  const reminderUnread = useReminderUnreadCount(headerRightIds.includes("reminders"));

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const goBack = useCallback(() => {
    const fallback = backHref ?? routePaths.patient;
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback);
  }, [router, backHref]);

  const shareWithFriend = useCallback(async () => {
    await shareCabinetLink();
    closeMenu();
  }, [closeMenu]);

  const renderHeaderIcon = (id: HeaderIconId) => {
    switch (id) {
      case "messages":
        return (
          <Link
            key="messages"
            href={routePaths.patientMessages}
            prefetch={false}
            aria-label="Сообщения"
            className={HEADER_ICON_CLASS}
          >
            <MessageCircle className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Link>
        );
      case "reminders":
        return (
          <Link
            key="reminders"
            href={routePaths.patientReminders}
            prefetch={false}
            aria-label="Напоминания"
            className={cn(HEADER_ICON_CLASS, "relative")}
          >
            <Bell className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
            {reminderUnread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {reminderUnread > 99 ? "99+" : reminderUnread}
              </span>
            ) : null}
          </Link>
        );
      case "menu":
        return (
          <Button
            key="menu"
            type="button"
            id="patient-menu-toggle"
            variant="ghost"
            size="icon"
            className={HEADER_ICON_CLASS}
            aria-label="Меню"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Button>
        );
      case "profile":
        return (
          <Link
            key="profile"
            href={routePaths.profile}
            prefetch={false}
            aria-label="Профиль"
            className={HEADER_ICON_CLASS}
          >
            <User className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Link>
        );
    }
  };

  const leftNav = (
    <div className="flex shrink-0 items-center gap-1">
      {showBack ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={HEADER_ICON_CLASS}
          onClick={goBack}
          aria-label={backLabel}
        >
          <ChevronLeft className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        </Button>
      ) : (
        <span className="inline-flex w-10 shrink-0" aria-hidden />
      )}
      {hideHome ? (
        <span className="inline-flex w-10 shrink-0" aria-hidden />
      ) : (
        <Link
          href="/app/patient"
          prefetch={false}
          aria-label="Главное меню"
          className={HEADER_ICON_CLASS}
        >
          <Home className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        </Link>
      )}
    </div>
  );

  const titleBadgeEl =
    titleBadge?.trim() ?
      <span
        data-testid="patient-header-title-badge"
        className="max-w-full truncate rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-foreground"
        title={titleBadge.trim()}
      >
        {titleBadge.trim()}
      </span>
    : null;

  const titleMuted = (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-center">
      {titleBadgeEl}
      <p
        className="m-0 w-full truncate text-[13px] font-normal text-muted-foreground"
        title={pageTitle}
      >
        {pageTitle}
      </p>
    </div>
  );

  const titleBrand = (
    <div className="flex min-w-0 max-w-[min(100vw-6rem,280px)] flex-col items-center gap-0.5 px-1">
      {titleBadgeEl}
      <p
        className="m-0 w-full truncate text-center text-base font-medium tracking-tight text-foreground"
        title={pageTitle}
      >
        {pageTitle}
      </p>
    </div>
  );

  const rightIcons = (
    <div className="flex shrink-0 items-center gap-1">
      {headerRightIds.map(renderHeaderIcon)}
    </div>
  );

  return (
    <>
      <header
        id="patient-header"
        className="safe-bleed-x sticky top-0 z-40 shrink-0 border-b border-border/60 bg-[var(--patient-surface)] py-2 shadow-sm"
      >
        {brandTitleBar ? (
          <div
            id="patient-header-row"
            className="grid w-full grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-1 px-0.5"
          >
            <div className="flex min-w-0 items-center justify-start gap-1">{leftNav}</div>
            {titleBrand}
            <div className="flex min-w-0 items-center justify-end gap-1">{rightIcons}</div>
          </div>
        ) : (
          <div id="patient-header-row" className="flex items-center gap-1.5">
            {leftNav}
            {titleMuted}
            {rightIcons}
          </div>
        )}
      </header>

      {nav.hasSheetMenu ? (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="right" className="flex w-[min(100vw,17rem)] flex-col px-4 sm:max-w-[17rem]">
            <SheetHeader className="px-0 text-left">
              <SheetTitle>Меню</SheetTitle>
            </SheetHeader>
            <nav id="patient-menu-nav" className="flex flex-col gap-1 py-2" aria-label="Навигация">
              {/* Блок 1: запись и визиты */}
              <Link
                id="patient-menu-link-booking"
                href={routePaths.bookingNew}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                Запись
              </Link>
              <Link
                id="patient-menu-link-address"
                href={routePaths.patientAddress}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                Адрес кабинета
              </Link>

              <Separator className="my-2" />

              {/* Блок 2: дневник и помощник */}
              <Link
                id="patient-menu-link-diary"
                href={routePaths.diary}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                Дневник
              </Link>
              <Link
                id="patient-menu-link-assistant"
                href={routePaths.patientReminders}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                Помощник
              </Link>

              <Separator className="my-2" />

              {/* Блок 3: профиль и действия */}
              <Link
                id="patient-menu-link-profile"
                href={routePaths.profile}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                Мой профиль
              </Link>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start px-3 py-2 font-normal"
                onClick={shareWithFriend}
              >
                Поделиться с другом
              </Button>

              {nav.showLogout ? (
                <>
                  <Separator className="my-2" />
                  <form action="/api/auth/logout" method="post" className="w-full">
                    <Button
                      type="submit"
                      variant="ghost"
                      id="patient-menu-logout"
                      className="h-auto w-full justify-start px-3 py-2 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={closeMenu}
                    >
                      Выйти
                    </Button>
                  </form>
                </>
              ) : null}
            </nav>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}
