"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { usePatientNotificationUnreadCount } from "@/modules/messaging/hooks/useSupportUnreadPolling";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/patient/navChrome";
import { PatientNavCountBadge } from "@/shared/ui/patient/PatientNavCountBadge";

type PatientNotificationInboxButtonProps = {
  className?: string;
  badgeClassName?: string;
  iconClassName?: string;
};

export function PatientNotificationInboxButton({
  className,
  badgeClassName,
  iconClassName,
}: PatientNotificationInboxButtonProps) {
  const unreadCount = usePatientNotificationUnreadCount();
  const ariaLabel = unreadCount > 0 ? `Уведомления, ${unreadCount} новых` : "Уведомления";

  return (
    <Link
      href={routePaths.notifications}
      prefetch={false}
      aria-label={ariaLabel}
      className={cn(className, "relative")}
    >
      <Bell className={cn("size-[22px]", iconClassName)} strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
      {unreadCount > 0 ? <PatientNavCountBadge count={unreadCount} className={badgeClassName} /> : null}
    </Link>
  );
}
