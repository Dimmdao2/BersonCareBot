"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell, Home, Menu, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

const MENU_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "profile", label: "Мой профиль", href: "/app/patient/profile" },
  { id: "cabinet", label: "Мои записи", href: "/app/patient/cabinet" },
  { id: "notifications", label: "Настройки уведомлений", href: "/app/patient/notifications" },
];

type PatientHeaderProps = {
  /** Заголовок экрана в шапке (не дублировать в main). */
  pageTitle: string;
  showBack?: boolean;
  backHref?: string;
  backLabel?: string;
};

export function PatientHeader({ pageTitle, showBack, backLabel = "Назад" }: PatientHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMessengerMiniApp, setIsMessengerMiniApp] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    queueMicrotask(() => {
      setIsMessengerMiniApp(isMessengerMiniAppHost());
    });
  }, []);

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

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
    window.open("https://dmitryberson.ru/adress", "_blank", "noopener,noreferrer");
    closeMenu();
  }, [closeMenu]);

  return (
    <>
      <header
        id="patient-header"
        className="sticky top-0 z-40 -mx-4 mb-4 border-b border-border/60 bg-[var(--patient-surface)] px-3 py-2 shadow-sm"
      >
        <div
          id="patient-header-row"
          className="flex items-center gap-2"
        >
          <div className="flex shrink-0 items-center gap-1">
            {showBack ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={goBack}
                aria-label={backLabel}
              >
                <span className="text-lg leading-none" aria-hidden>←</span>
              </Button>
            ) : (
              <span className="inline-flex w-8 shrink-0" aria-hidden />
            )}
            <Link
              href="/app/patient"
              prefetch={false}
              aria-label="Главное меню"
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
            >
              <Home className="size-5" aria-hidden />
            </Link>
          </div>

          <div className="min-w-0 flex-1 text-center">
            <p
              className="truncate text-sm font-medium text-muted-foreground"
              title={pageTitle}
            >
              {pageTitle}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <Link
              href={routePaths.patientMessages}
              prefetch={false}
              aria-label="Сообщения"
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative")}
            >
              <MessageCircle className="size-5" aria-hidden />
              <Badge
                variant="secondary"
                className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] leading-none"
              >
                0
              </Badge>
            </Link>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Уведомления" disabled>
              <Bell className="size-5 opacity-50" aria-hidden />
            </Button>
            <Button
              type="button"
              id="patient-menu-toggle"
              variant="ghost"
              size="icon-sm"
              aria-label="Меню"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="flex w-[min(100vw,20rem)] flex-col px-4 sm:max-w-sm">
          <SheetHeader className="px-0 text-left">
            <SheetTitle>Меню</SheetTitle>
          </SheetHeader>
          <nav id="patient-menu-nav" className="flex flex-col gap-1 py-2" aria-label="Навигация">
            <Link
              id="patient-menu-link-messages"
              href={routePaths.patientMessages}
              onClick={closeMenu}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-auto w-full justify-start px-3 py-2 font-normal",
              )}
            >
              Сообщения
            </Link>
            {MENU_ITEMS.map((item) => (
              <Link
                key={item.id}
                id={`patient-menu-link-${item.id}`}
                href={item.href}
                onClick={closeMenu}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "h-auto w-full justify-start px-3 py-2 font-normal",
                )}
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
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-auto w-full justify-start px-3 py-2 font-normal",
              )}
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
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-auto w-full justify-start px-3 py-2 font-normal",
              )}
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
