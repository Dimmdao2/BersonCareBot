"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { DOCTOR_MENU_ENTRIES, isDoctorNavItemActive } from "@/shared/ui/doctorNavLinks";
import {
  DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS,
  DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";

const SIDEBAR_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 text-sm font-normal",
);

type DoctorAdminSidebarProps = {
  userDisplayName?: string;
};

/**
 * Левое меню разделов кабинета на md+ (под полноширинной шапкой); на мобильных скрыто (Sheet в шапке).
 */
export function DoctorAdminSidebar({ userDisplayName }: DoctorAdminSidebarProps) {
  const pathname = usePathname() ?? "/app/doctor";

  return (
    <aside
      id="doctor-admin-sidebar"
      className={cn(
        "hidden md:flex",
        DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS,
        "shrink-0 flex-col border-r border-border/70 bg-background pb-4 pl-3 pr-2 pt-4",
        "md:sticky md:self-start md:overflow-y-auto",
        "md:max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-0.5rem)]",
        DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS,
      )}
      aria-label="Разделы кабинета"
    >
      <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Разделы</p>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Разделы кабинета">
        {DOCTOR_MENU_ENTRIES.map((entry) =>
          entry.kind === "separator" ? (
            <Separator key={entry.id} className="my-2" />
          ) : (
            <Link
              key={entry.id}
              id={`doctor-sidebar-link-${entry.id}`}
              href={entry.href}
              className={cn(
                SIDEBAR_LINK_CLASS,
                isDoctorNavItemActive(entry.href, pathname) && "bg-muted font-medium text-foreground",
              )}
            >
              {entry.label}
            </Link>
          ),
        )}
        <Separator className="my-2" />
        <Link href="/app/settings" className={SIDEBAR_LINK_CLASS}>
          Профиль и настройки
        </Link>
        <Separator className="my-2" />
        <form action="/api/auth/logout" method="post" className="w-full">
          <Button
            type="submit"
            variant="ghost"
            id="doctor-sidebar-logout"
            className="h-auto w-full justify-start px-3 py-2 text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Выйти
          </Button>
        </form>
      </nav>
      {userDisplayName ? (
        <p className="mt-3 truncate px-3 text-xs text-muted-foreground" title={userDisplayName}>
          {userDisplayName}
        </p>
      ) : null}
    </aside>
  );
}
