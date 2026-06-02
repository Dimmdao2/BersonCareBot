"use client";

import { Button } from "@/components/ui/button";
import { DoctorChatPanel } from "@/modules/messaging/components/DoctorChatPanel";
import { useDoctorPatientSupportChat } from "./useDoctorPatientSupportChat";
import { doctorClientStackedCardClass } from "./doctorClientCardChrome";

type Props = {
  patientUserId: string;
  onUnreadChange?: (count: number) => void;
};

export function DoctorClientEmbeddedChat({ patientUserId, onUnreadChange }: Props) {
  const chat = useDoctorPatientSupportChat(patientUserId, onUnreadChange);

  if (chat.loading) {
    return (
      <div className={`${doctorClientStackedCardClass} min-h-[280px] animate-pulse bg-muted/20`} aria-busy>
        <p className="sr-only">Загрузка чата…</p>
      </div>
    );
  }

  if (chat.error) {
    return (
      <div className={doctorClientStackedCardClass}>
        <p className="text-sm text-destructive">{chat.error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void chat.retry()}>
          Повторить
        </Button>
      </div>
    );
  }

  if (!chat.conversationId) {
    return null;
  }

  return (
    <div className={`${doctorClientStackedCardClass} flex min-h-[min(50vh,420px)] flex-col overflow-hidden p-0`}>
      <DoctorChatPanel
        key={chat.conversationId}
        conversationId={chat.conversationId}
        initialMessages={chat.initialMessages}
        className="min-h-[min(50vh,420px)] flex-1"
        onReadStateChanged={() => {
          chat.setUnreadCount(0);
          onUnreadChange?.(0);
        }}
      />
    </div>
  );
}
