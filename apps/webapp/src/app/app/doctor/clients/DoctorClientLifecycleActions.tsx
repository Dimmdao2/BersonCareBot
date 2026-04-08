"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  isArchived: boolean;
  /** Куда вернуться после удаления или для refresh контекста (с `scope=`, если нужно). */
  listBasePath: string;
  /** Роль admin (для подсказок UI). */
  isAdmin?: boolean;
  /** Безвозвратное удаление: только при admin + adminMode. */
  canPermanentDelete?: boolean;
};

export function DoctorClientLifecycleActions({
  userId,
  isArchived,
  listBasePath,
  isAdmin = false,
  canPermanentDelete = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"archive" | "unarchive" | "purge" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function archiveClient() {
    if (
      !window.confirm(
        "Переместить клиента в архив?\n\n" +
          "Карточка исчезнет из обычных списков. Позже можно удалить учётную запись безвозвратно только из раздела «Архив».",
      )
    ) {
      return;
    }
    setBusy("archive");
    setMsg(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg("Не удалось архивировать. Попробуйте снова или обратитесь к администратору.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function unarchiveClient() {
    if (!window.confirm("Вернуть клиента из архива в обычные списки?")) return;
    setBusy("unarchive");
    setMsg(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setMsg("Не удалось снять архив.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function permanentDelete() {
    if (
      !window.confirm(
        "БЕЗВОЗВРАТНО удалить учётную запись клиента и связанные данные в системе?\n\n" +
          "Это действие нельзя отменить. Дальше потребуется ввести ID клиента для подтверждения.",
      )
    ) {
      return;
    }
    const typed = window.prompt(
      `Введите полный ID клиента для подтверждения удаления:\n(${userId})`,
    );
    if (typed === null) return;
    if (typed.trim() !== userId) {
      setMsg("ID не совпал — удаление отменено.");
      return;
    }

    setBusy("purge");
    setMsg(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUserId: userId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        integratorSkipped?: boolean;
      };
      if (!res.ok || !data.ok) {
        if (data.error === "must_archive_first") {
          setMsg("Сначала архивируйте клиента, затем удаление доступно из архива.");
        } else {
          setMsg("Не удалось выполнить удаление.");
        }
        return;
      }
      if (data.integratorSkipped) {
        window.alert(
          "Учётная запись удалена из веб-приложения. Интегратор (бот) мог не очиститься автоматически — при необходимости выполните очистку вручную на сервере.",
        );
      }
      router.push(listBasePath);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3 border-amber-500/30"
      aria-labelledby="doctor-client-lifecycle-heading"
    >
      <h2 id="doctor-client-lifecycle-heading" className="text-base font-semibold">
        Учётная запись
      </h2>
      <p className="text-muted-foreground text-sm">
        Сначала архив. Безвозвратное удаление — только для администратора в режиме администратора (двойное
        подтверждение).
      </p>
      {isArchived && isAdmin && !canPermanentDelete ? (
        <p className="text-sm text-muted-foreground" role="status">
          Включите режим администратора в разделе «Настройки», чтобы удалить учётную запись безвозвратно.
        </p>
      ) : null}
      {!isAdmin && isArchived ? (
        <p className="text-sm text-muted-foreground" role="status">
          Безвозвратное удаление учётной записи выполняет только администратор.
        </p>
      ) : null}
      {msg ? (
        <p className="text-sm text-foreground" role="status">
          {msg}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!isArchived ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void archiveClient()}
            id="doctor-client-archive-btn"
          >
            {busy === "archive" ? "…" : "В архив"}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void unarchiveClient()}
              id="doctor-client-unarchive-btn"
            >
              {busy === "unarchive" ? "…" : "Вернуть из архива"}
            </Button>
            {canPermanentDelete ? (
              <Button
                type="button"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => void permanentDelete()}
                id="doctor-client-permanent-delete-btn"
              >
                {busy === "purge" ? "…" : "Удалить безвозвратно"}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
