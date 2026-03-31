"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import {
  Bell,
  ChevronLeft,
  Home,
  Menu,
  MessageCircle,
  Settings,
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
};

export function PatientHeader({
  pageTitle,
  showBack,
  backHref,
  backLabel = "Назад",
}: PatientHeaderProps) {
  const router = useRouter();
  const platform = usePlatform();
  const nav = patientNavByPlatform[platform];
  const [menuOpen, setMenuOpen] = useState(false);
  const reminderUnread = useReminderUnreadCount(nav.headerRightIcons.includes("reminders"));

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
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/app/patient`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
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
            <MessageCircle className="size-[22px]" aria-hidden />
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
            <Bell className="size-[22px]" aria-hidden />
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
            <Menu className="size-[22px]" aria-hidden />
          </Button>
        );
      case "settings":
        return (
          <Link
            key="settings"
            href="/app/settings"
            prefetch={false}
            aria-label="Настройки"
            className={HEADER_ICON_CLASS}
          >
            <Settings className="size-[22px]" aria-hidden />
          </Link>
        );
    }
  };

  return (
    <>
      <header
        id="patient-header"
        className="safe-bleed-x sticky top-0 z-40 shrink-0 border-b border-border/60 bg-[var(--patient-surface)] py-2 shadow-sm"
      >
        <div
          id="patient-header-row"
          className="flex items-center gap-1.5"
        >
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
                <ChevronLeft className="size-[22px]" aria-hidden />
              </Button>
            ) : (
              <span className="inline-flex w-10 shrink-0" aria-hidden />
            )}
            <Link
              href="/app/patient"
              prefetch={false}
              aria-label="Главное меню"
              className={HEADER_ICON_CLASS}
            >
              <Home className="size-[22px]" aria-hidden />
            </Link>
          </div>

          <div className="min-w-0 flex-1 text-center">
            <p
              className="truncate text-[13px] font-medium text-muted-foreground"
              title={pageTitle}
            >
              {pageTitle}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {nav.headerRightIcons.map(renderHeaderIcon)}
          </div>
        </div>
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
                href={routePaths.patientBooking}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                Записаться на приём
              </Link>
              <Link
                id="patient-menu-link-cabinet"
                href={routePaths.cabinet}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                Мои приёмы
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
