"use client";

import { useCallback, useEffect, useState } from "react";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";

export function useDoctorPatientSupportChat(
  patientUserId: string,
  onUnreadChange?: (count: number) => void,
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<SerializedSupportMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const ensure = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/doctor/messages/conversations/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientUserId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        conversationId?: string;
        messages?: SerializedSupportMessage[];
        unreadFromUserCount?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.conversationId) {
        if (data.error === "patient_not_found") {
          setError("Пациент не найден, чат открыть нельзя.");
        } else if (data.error === "conversation_ensure_failed") {
          setError("Не удалось открыть чат. Попробуйте ещё раз.");
        } else {
          setError("Не удалось открыть чат пациента");
        }
        setConversationId(null);
        return;
      }
      setConversationId(data.conversationId);
      setInitialMessages(data.messages ?? []);
      const unread = data.unreadFromUserCount ?? 0;
      setUnreadCount(unread);
      onUnreadChange?.(unread);
    } catch {
      setError("Ошибка сети при открытии чата");
      setConversationId(null);
    } finally {
      setLoading(false);
    }
  }, [patientUserId, onUnreadChange]);

  useEffect(() => {
    void ensure();
  }, [ensure]);

  return {
    loading,
    error,
    conversationId,
    initialMessages,
    unreadCount,
    setUnreadCount,
    retry: ensure,
  };
}
