"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  initiallyBlocked: boolean;
  blockedReason: string | null;
};

export function SubscriberBlockPanel({ userId, initiallyBlocked, blockedReason }: Props) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [reason, setReason] = useState(blockedReason ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setBlock(next: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: next, reason: next ? reason.trim() || null : null }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Не удалось сохранить");
        return;
      }
      setBlocked(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="doctor-subscriber-block-section"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4"
      aria-labelledby="doctor-block-heading"
    >
      <h2 id="doctor-block-heading">Блокировка чата поддержки</h2>
      <p className="text-muted-foreground text-sm">
        При блокировке пациент не сможет отправлять сообщения в чат поддержки из приложения.
      </p>
      {blocked ? (
        <p className="text-sm">
          Статус: <strong className="text-destructive">заблокирован</strong>
          {blockedReason ? ` — ${blockedReason}` : ""}
        </p>
      ) : (
        <p className="text-sm">
          Статус: <strong>не заблокирован</strong>
        </p>
      )}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {blocked ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={() => void setBlock(false)}>
          Снять блокировку
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="block-reason" className="text-sm">
            Причина (необязательно)
          </label>
          <textarea
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={2000}
          />
          <Button type="button" variant="destructive" disabled={pending} onClick={() => void setBlock(true)}>
            Заблокировать отправку сообщений
          </Button>
        </div>
      )}
    </section>
  );
}
