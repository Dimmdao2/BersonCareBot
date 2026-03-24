"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  /** Пример integrator id записи для демонстрации soft-delete (опционально). */
  sampleIntegratorRecordId?: string | null;
};

export function AdminDangerActions({ userId, sampleIntegratorRecordId }: Props) {
  const [busy, setBusy] = useState<"archive" | "record" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function archiveUser() {
    if (!window.confirm("Архивировать учётную запись пользователя? Она исчезнет из списков врача.")) {
      return;
    }
    setBusy("archive");
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg("Ошибка архивации");
        return;
      }
      setMsg("Пользователь заархивирован.");
    } finally {
      setBusy(null);
    }
  }

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
    <section className="panel stack border-destructive/40" aria-labelledby="admin-danger-heading">
      <h2 id="admin-danger-heading" className="text-destructive">
        Администратор
      </h2>
      <p className="text-muted-foreground text-sm">Действия доступны только роли admin (проверка на сервере).</p>
      {msg ? <p className="text-sm">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void archiveUser()}>
          {busy === "archive" ? "…" : "Архивировать пользователя"}
        </Button>
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
