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
import { getDoctorScreenTitle } from "@/shared/ui/doctorScreenTitles";

type DoctorHeaderProps = {
  userDisplayName?: string;
};

const DOCTOR_SHEET_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 font-normal",
);

const DOCTOR_MENU_LINKS: { id: string; label: string; href: string }[] = [
  { id: "overview", label: "Обзор", href: "/app/doctor" },
  { id: "clients", label: "Клиенты", href: "/app/doctor/clients" },
  { id: "appointments", label: "Записи", href: "/app/doctor/appointments" },
  { id: "messages", label: "Сообщения", href: "/app/doctor/messages" },
  { id: "broadcasts", label: "Рассылки", href: "/app/doctor/broadcasts" },
  { id: "references", label: "Справочники", href: "/app/doctor/references" },
  { id: "content", label: "CMS", href: "/app/doctor/content" },
  { id: "stats", label: "Статистика", href: "/app/doctor/stats" },
];

export function DoctorHeader({ userDisplayName }: DoctorHeaderProps) {
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
        className="fixed top-0 right-0 left-0 z-50 border-b border-border/70 bg-background/95 shadow-sm backdrop-blur-sm supports-backdrop-filter:bg-background/80"
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 md:px-4">
          <div className="flex min-w-0 shrink-0 items-center gap-1">
            {showBack ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Назад"
                onClick={goBack}
              >
                <ArrowLeft className="size-5" aria-hidden />
              </Button>
            ) : (
              <span className="inline-flex w-8 shrink-0" aria-hidden />
            )}
            <Link
              href="/app/doctor"
              prefetch={false}
              aria-label="Дашборд"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <Home className="size-5" aria-hidden />
            </Link>
          </div>

          <p
            className="min-w-0 flex-1 truncate text-center text-sm font-medium text-muted-foreground"
            title={title}
          >
            {title}
          </p>

          <div className="flex shrink-0 items-center gap-0.5">
            <Link
              href="/app/doctor/clients"
              prefetch={false}
              aria-label="Клиенты"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <Users className="size-5" aria-hidden />
            </Link>
            <Link
              href="/app/doctor/messages"
              prefetch={false}
              aria-label="Сообщения"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <MessageCircle className="size-5" aria-hidden />
            </Link>
            <Button
              type="button"
              id="doctor-menu-toggle"
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
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
