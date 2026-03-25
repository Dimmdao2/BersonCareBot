"use client";

import { useState } from "react";

type Props = {
  recordId: string;
};

export function DoctorAppointmentActions({ recordId }: Props) {
  const [pending, setPending] = useState<"cancel" | "reschedule" | null>(null);
  const [note, setNote] = useState<string>("");

  async function callApi(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || json.ok !== true) {
      throw new Error(json.error ?? `http_${res.status}`);
    }
  }

  async function onCancel() {
    setPending("cancel");
    setNote("");
    try {
      await callApi("/api/doctor/appointments/rubitime/cancel", { recordId });
      setNote("Отправлено в Rubitime: отмена.");
    } catch (err) {
      setNote(`Ошибка отмены: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setPending(null);
    }
  }

  async function onReschedule() {
    setPending("reschedule");
    setNote("");
    try {
      // Rubitime status=7: "Перенос записи" (см. USER_TODO_STAGE / Rubitime API).
      await callApi("/api/doctor/appointments/rubitime/update", { recordId, patch: { status: 7 } });
      setNote("Отправлено в Rubitime: перевод в статус переноса.");
    } catch (err) {
      setNote(`Ошибка переноса: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onReschedule}
          disabled={pending !== null}
          aria-label={`doctor-appointment-reschedule-${recordId}`}
        >
          Перенести
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending !== null}
          aria-label={`doctor-appointment-cancel-${recordId}`}
        >
          Отменить
        </button>
      </div>
      {note ? (
        <span style={{ fontSize: 12, opacity: 0.85 }} aria-live="polite">
          {note}
        </span>
      ) : null}
    </div>
  );
}
