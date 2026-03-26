"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell, ChevronLeft, Home, Menu, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { usePatientSupportUnreadCount } from "@/shared/hooks/useSupportUnreadPolling";
import { useReminderUnreadCount } from "@/shared/hooks/useReminderUnread";

/** Единый стиль пунктов бокового меню (Sheet). */
const SHEET_NAV_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 font-normal",
);

/** Touch target ≥ 44px (WCAG); `size="icon"` в дизайн-системе = 32px — переопределяем. */
const HEADER_ICON_CLASS = cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10 shrink-0");

const MENU_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "profile", label: "Мой профиль", href: "/app/patient/profile" },
  { id: "cabinet", label: "Мои записи", href: "/app/patient/cabinet" },
  { id: "diary", label: "Дневник", href: routePaths.diary },
  { id: "reminders", label: "Напоминания", href: "/app/patient/reminders" },
  { id: "notifications", label: "Настройки уведомлений", href: "/app/patient/notifications" },
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMessengerMiniApp, setIsMessengerMiniApp] = useState(false);
  const supportUnread = usePatientSupportUnreadCount();
  const reminderUnread = useReminderUnreadCount();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    queueMicrotask(() => {
      setIsMessengerMiniApp(isMessengerMiniAppHost());
    });
  }, []);

  const goBack = useCallback(() => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    router.back();
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

  const openCabinetAddress = useCallback(() => {
    router.push(routePaths.patientAddress);
    closeMenu();
  }, [closeMenu, router]);

  return (
    <>
      <header
        id="patient-header"
        className="patient-edge-bleed sticky top-0 z-40 mb-4 border-b border-border/60 bg-[var(--patient-surface)] py-2 shadow-sm"
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
            <Link
              href={routePaths.patientMessages}
              prefetch={false}
              aria-label="Сообщения"
              className={cn(HEADER_ICON_CLASS, "relative")}
            >
              <MessageCircle className="size-[22px]" aria-hidden />
              {supportUnread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                  {supportUnread > 99 ? "99+" : supportUnread}
                </span>
              ) : null}
            </Link>
            <Link
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
            <Button
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
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="flex w-[min(100vw,17rem)] flex-col px-4 sm:max-w-[17rem]">
          <SheetHeader className="px-0 text-left">
            <SheetTitle>Меню</SheetTitle>
          </SheetHeader>
          <nav id="patient-menu-nav" className="flex flex-col gap-1 py-2" aria-label="Навигация">
            <Link
              id="patient-menu-link-messages"
              href={routePaths.patientMessages}
              onClick={closeMenu}
              className={SHEET_NAV_LINK_CLASS}
            >
              Сообщения
            </Link>
            {MENU_ITEMS.map((item) => (
              <Link
                key={item.id}
                id={`patient-menu-link-${item.id}`}
                href={item.href}
                onClick={closeMenu}
                className={SHEET_NAV_LINK_CLASS}
              >
                {item.label}
              </Link>
            ))}
            <Separator className="my-2" />
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start px-3 py-2 font-normal"
              onClick={openCabinetAddress}
            >
              Адрес кабинета
            </Button>
            <Link
              id="patient-menu-link-help"
              href={routePaths.patientHelp}
              onClick={closeMenu}
              className={SHEET_NAV_LINK_CLASS}
            >
              Справка
            </Link>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start px-3 py-2 font-normal"
              onClick={shareWithFriend}
            >
              Поделиться с другом
            </Button>
            <Link
              id="patient-menu-link-install"
              href={routePaths.patientInstall}
              onClick={closeMenu}
              className={SHEET_NAV_LINK_CLASS}
            >
              Установить приложение
            </Link>
            {!isMessengerMiniApp ? (
              <>
                <Separator className="my-2" />
                <Button
                  type="button"
                  variant="ghost"
                  id="patient-menu-logout"
                  className="h-auto w-full justify-start px-3 py-2 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    closeMenu();
                    window.location.href = "/api/auth/logout";
                  }}
                >
                  Выйти
                </Button>
              </>
            ) : null}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
