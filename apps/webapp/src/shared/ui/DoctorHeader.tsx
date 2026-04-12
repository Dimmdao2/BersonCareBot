"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  ArrowLeft,
  Home,
  Menu,
  MessageCircle,
  Users,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { DOCTOR_MENU_LINKS } from "@/shared/ui/doctorNavLinks";
import { DOCTOR_HEADER_INNER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { getDoctorScreenTitle } from "@/shared/ui/doctorScreenTitles";

type DoctorHeaderProps = {
  userDisplayName?: string;
  adminMode?: boolean;
  /** Когда true (админ + левый сайдбар в layout), кнопка «Меню» скрыта на md+. */
  hideMenuOnDesktop?: boolean;
};

const DOCTOR_SHEET_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 font-normal",
);

/** Touch target ≥ 44px; базовый `icon` = 32px — переопределение. */
const HEADER_ICON_CLASS = cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10 shrink-0");

export function DoctorHeader({ userDisplayName, adminMode, hideMenuOnDesktop }: DoctorHeaderProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/app/doctor";
  const title = getDoctorScreenTitle(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const showBack = pathname !== "/app/doctor" && pathname !== "/app/doctor/";

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <>
      <header
        id="doctor-header"
        className={cn(
          "fixed top-0 right-0 left-0 z-50 border-b border-border/70 shadow-sm backdrop-blur-sm supports-backdrop-filter:bg-background/80",
          adminMode ? "bg-destructive/10" : "bg-background/95",
        )}
      >
        <div className={DOCTOR_HEADER_INNER_CLASS}>
          <div className="flex min-w-0 shrink-0 items-center gap-1">
            {showBack ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={HEADER_ICON_CLASS}
                aria-label="Назад"
                onClick={goBack}
              >
                <ArrowLeft className="size-[22px]" aria-hidden />
              </Button>
            ) : (
              <span className="inline-flex w-10 shrink-0" aria-hidden />
            )}
            <Link
              href="/app/doctor"
              prefetch={false}
              aria-label="Дашборд"
              className={HEADER_ICON_CLASS}
            >
              <Home className="size-[22px]" aria-hidden />
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <p
              className="min-w-0 truncate text-center text-[13px] font-medium text-muted-foreground"
              title={title}
            >
              {title}
            </p>
            {adminMode ? (
              <span className="shrink-0 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground">
                ADMIN MODE
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/app/doctor/clients?scope=all"
              prefetch={false}
              aria-label="Клиенты и подписчики"
              className={HEADER_ICON_CLASS}
            >
              <Users className="size-[22px]" aria-hidden />
            </Link>
            <Link
              href="/app/doctor/messages"
              prefetch={false}
              aria-label="Сообщения"
              className={HEADER_ICON_CLASS}
            >
              <MessageCircle className="size-[22px]" aria-hidden />
            </Link>
            <Button
              type="button"
              id="doctor-menu-toggle"
              variant="ghost"
              size="icon"
              className={cn(HEADER_ICON_CLASS, hideMenuOnDesktop && "md:hidden")}
              aria-label="Меню"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-[22px]" aria-hidden />
            </Button>
          </div>
        </div>
        {userDisplayName ? (
          <p className="sr-only">Пользователь: {userDisplayName}</p>
        ) : null}
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="flex w-[min(100vw,22rem)] flex-col px-4 sm:max-w-sm">
          <SheetHeader className="px-0 text-left">
            <SheetTitle>Разделы</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 py-2" aria-label="Разделы кабинета">
            {DOCTOR_MENU_LINKS.map((item) => (
              <Link
                key={item.id}
                id={`doctor-menu-link-${item.id}`}
                href={item.href}
                onClick={closeMenu}
                className={DOCTOR_SHEET_LINK_CLASS}
              >
                {item.label}
              </Link>
            ))}
            <Separator className="my-2" />
            <Link href="/app/settings" onClick={closeMenu} className={DOCTOR_SHEET_LINK_CLASS}>
              Профиль и настройки
            </Link>
            <Separator className="my-2" />
            <form action="/api/auth/logout" method="post" className="w-full">
              <Button
                type="submit"
                variant="ghost"
                id="doctor-menu-logout"
                className="h-auto w-full justify-start px-3 py-2 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={closeMenu}
              >
                Выйти
              </Button>
            </form>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
