"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";
import { ChatView } from "@/modules/messaging/components/ChatView";
import {
  notifyPatientNotificationUnreadCountChanged,
  usePatientNotificationUnreadCount,
} from "@/modules/messaging/hooks/useSupportUnreadPolling";
import { Button } from "@/shared/ui/patient/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/patient/primitives/sheet";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/patient/navChrome";
import { PatientNavCountBadge } from "@/shared/ui/patient/PatientNavCountBadge";
import { PATIENT_OVERLAY_PANEL_WIDTH_CLASS } from "@/shared/ui/patient/pwaLayoutClasses";

type InboxResponse = {
  ok?: boolean;
  messages?: SerializedSupportMessage[];
  unreadCount?: number;
};

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
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SerializedSupportMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/patient/notifications/inbox");
      const data = (await res.json()) as InboxResponse;
      if (data.ok && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch {
      /* silent: шапка не должна падать из-за inbox */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("notifications") === "1") {
      setOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!open) return;
    void loadInbox();
    void fetch("/api/patient/notifications/inbox/read", { method: "POST" })
      .then(() => notifyPatientNotificationUnreadCountChanged())
      .catch(() => undefined);
  }, [loadInbox, open]);

  const ariaLabel = unreadCount > 0 ? `Уведомления, ${unreadCount} новых` : "Уведомления";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={ariaLabel}
        className={cn(className, "relative")}
        onClick={() => setOpen(true)}
      >
        <Bell className={cn("size-[22px]", iconClassName)} strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        {unreadCount > 0 ? <PatientNavCountBadge count={unreadCount} className={badgeClassName} /> : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            PATIENT_OVERLAY_PANEL_WIDTH_CLASS,
            "flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden p-0",
          )}
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
            <SheetTitle>Уведомления</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
            <ChatView
              variant="patient"
              relativeFooters
              messages={messages}
              emptyText={loading ? "Загружаем уведомления..." : "Пока нет уведомлений."}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
