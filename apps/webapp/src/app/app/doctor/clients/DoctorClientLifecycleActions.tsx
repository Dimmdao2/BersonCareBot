"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Ответ успешного POST permanent-delete (фрагмент `details` из strict purge). */
type PermanentDeleteDetails = {
  integratorError?: string | null;
  s3Failures?: { key: string; error: string }[];
  mediaRowDeleteErrors?: { id: string; error: string }[];
};

function buildPermanentDeleteAdminNotice(args: {
  outcome?: string;
  integratorSkipped?: boolean;
  details?: PermanentDeleteDetails;
}): string | null {
  const { outcome, integratorSkipped, details: d } = args;
  const s3n = d?.s3Failures?.length ?? 0;
  const mediaErrN = d?.mediaRowDeleteErrors?.length ?? 0;
  const intErr = typeof d?.integratorError === "string" && d.integratorError.trim().length > 0 ? d.integratorError.trim() : null;

  const needsNotice =
    integratorSkipped === true ||
    (outcome != null && outcome !== "completed") ||
    intErr != null ||
    s3n > 0 ||
    mediaErrN > 0;

  if (!needsNotice) return null;

  const parts: string[] = ["Учётная запись в веб-приложении удалена."];

  if (integratorSkipped) {
    parts.push(
      "Очистка БД интегратора (бот) в этом запросе не выполнялась: не настроен пул подключения к БД integrator на стороне webapp.",
    );
  }

  if (outcome != null && outcome !== "completed") {
    parts.push(
      `Внешняя очистка завершена не полностью (итог: ${outcome}). Ниже — детали, если сервер их вернул.`,
    );
  }

  if (intErr) {
    parts.push(`Ошибка очистки integrator:\n${intErr}`);
  }

  if (s3n > 0) {
    const preview = (d?.s3Failures ?? [])
      .slice(0, 3)
      .map((f) => `• ${f.key}: ${f.error}`)
      .join("\n");
    const tail = s3n > 3 ? `\n… и ещё ${s3n - 3}` : "";
    parts.push(`Ошибки удаления объектов S3 (${s3n}):\n${preview}${tail}`);
  }

  if (mediaErrN > 0) {
    parts.push(`Не удалось удалить ${mediaErrN} строк(и) в media_files (см. лог операций).`);
  }

  parts.push('Полные данные — «Настройки» → «Лог операций», действие user_purge (JSON в «Детали»).');

  return parts.join("\n\n");
}

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
        message?: string;
        integratorSkipped?: boolean;
        outcome?: string;
        details?: PermanentDeleteDetails;
      };
      if (!res.ok || !data.ok) {
        if (data.error === "must_archive_first") {
          setMsg("Сначала архивируйте клиента, затем удаление доступно из архива.");
        } else if (data.error === "purge_transaction_failed" && data.message) {
          setMsg(`Ошибка при удалении в БД: ${data.message}`);
        } else {
          setMsg("Не удалось выполнить удаление.");
        }
        return;
      }
      const adminNotice = buildPermanentDeleteAdminNotice({
        outcome: data.outcome,
        integratorSkipped: data.integratorSkipped,
        details: data.details,
      });
      if (adminNotice) {
        window.alert(adminNotice);
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
