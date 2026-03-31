"use client";

import { useState } from "react";

export function useCancelBooking() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelBooking(bookingId: string, reason?: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok !== true) {
        setError(json.error ?? "Не удалось отменить запись");
        return false;
      }
      return true;
    } catch {
      setError("Ошибка сети при отмене записи");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, cancelBooking };
}
