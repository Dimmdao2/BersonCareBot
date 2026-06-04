"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BOOKING_ADMIN_TABS,
  bookingAdminTabFromPathname,
} from "@/app/app/doctor/admin/booking/bookingAdminTabs";
import { DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

export function BookingAdminTabsNav() {
  const pathname = usePathname();
  const activeId = bookingAdminTabFromPathname(pathname);

  return (
    <nav
      className={cn(
        "sticky z-20 -mx-3 mb-4 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-md supports-backdrop-filter:bg-background/90",
        DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
      )}
      aria-label="Разделы настроек записи"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BOOKING_ADMIN_TABS.map((tab) => {
          const active = tab.id === activeId;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
