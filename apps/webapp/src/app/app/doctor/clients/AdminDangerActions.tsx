"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  /** Пример integrator id записи для демонстрации soft-delete (опционально). */
  sampleIntegratorRecordId?: string | null;
};

export function AdminDangerActions({ userId, sampleIntegratorRecordId }: Props) {
  const [busy, setBusy] = useState<"record" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function softDeleteRecord() {
    if (!sampleIntegratorRecordId?.trim()) {
      setMsg("Нет id записи для удаления.");
      return;
    }
    if (!window.confirm("Пометить запись на приём как удалённую?")) return;
    setBusy("record");
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/appointment-records/${encodeURIComponent(sampleIntegratorRecordId)}/soft-delete`,
        { method: "POST" }
      );
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setMsg("Ошибка удаления записи");
        return;
      }
      setMsg("Запись помечена удалённой.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4 border-destructive/40" aria-labelledby="admin-danger-heading">
      <h2 id="admin-danger-heading" className="text-destructive">
        Администратор
      </h2>
      <p className="text-muted-foreground text-sm">
        Дополнительные действия администратора (проверка на сервере). Архив и удаление — в блоке «Учётная запись» выше.
      </p>
      {msg ? <p className="text-sm">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        {sampleIntegratorRecordId ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void softDeleteRecord()}
          >
            {busy === "record" ? "…" : "Удалить запись (soft)"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
