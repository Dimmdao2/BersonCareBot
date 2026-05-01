"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NOTIFICATIONS_TOPICS_MAX,
  NOTIFICATION_TOPIC_ID_MAX_LEN,
  NOTIFICATION_TOPIC_TITLE_MAX_LEN,
  isValidNotificationTopicId,
  isValidNotificationTopicTitle,
} from "@/modules/patient-notifications/notificationsTopics";
import { patchAdminSetting } from "./patchAdminSetting";

export type NotificationsTopicsSectionProps = {
  initialRows: Array<{ id: string; title: string }>;
};

export function NotificationsTopicsSection({ initialRows }: NotificationsTopicsSectionProps) {
  const [rows, setRows] = useState<Array<{ id: string; title: string }>>(() => [...initialRows]);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    setRows((r) => {
      if (r.length >= NOTIFICATIONS_TOPICS_MAX) return r;
      return [...r, { id: "", title: "" }];
    });
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: "id" | "title", value: string) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      if (rows.length === 0) {
        setError("Добавьте хотя бы одну тему.");
        return;
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        if (!isValidNotificationTopicId(r.id)) {
          setError(
            `Строка ${i + 1}: код темы — латиница, цифры и «_», до ${NOTIFICATION_TOPIC_ID_MAX_LEN} символов.`,
          );
          return;
        }
        if (!isValidNotificationTopicTitle(r.title)) {
          setError(`Строка ${i + 1}: укажите подпись (до ${NOTIFICATION_TOPIC_TITLE_MAX_LEN} символов).`);
          return;
        }
      }
      const trimmedIds = rows.map((row) => row.id.trim());
      if (new Set(trimmedIds).size !== trimmedIds.length) {
        setError("Коды тем не должны повторяться.");
        return;
      }
      const payload = rows.map((row) => ({ id: row.id.trim(), title: row.title.trim() }));
      const ok = await patchAdminSetting("notifications_topics", payload);
      if (!ok) {
        setError(
          "Не удалось сохранить. Проверьте: код темы (латиница, цифры, _), длину подписи, уникальность кодов; при заполненной проекции рассылок код должен существовать в справочнике тем.",
        );
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card className="mt-6 border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Темы рассылок (пациент)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Подписи для блока «Темы рассылок» на странице пациента{" "}
          <code className="rounded bg-muted px-1">/notifications</code>. Поле «код» совпадает с кодом темы
          рассылки в интеграторе (<code className="rounded bg-muted px-1">mailing_topics</code>
          ). Порядок строк — порядок отображения. Не больше {NOTIFICATIONS_TOPICS_MAX} тем.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li
              key={`topic-row-${index}`}
              className="grid gap-2 rounded-lg border border-border/70 bg-background/50 p-3 sm:grid-cols-[1fr_2fr_auto]"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">Код темы</span>
                <Input
                  value={row.id}
                  onChange={(e) => updateRow(index, "id", e.target.value)}
                  disabled={pending}
                  maxLength={NOTIFICATION_TOPIC_ID_MAX_LEN}
                  placeholder="news"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">Подпись для пациента</span>
                <Input
                  value={row.title}
                  onChange={(e) => updateRow(index, "title", e.target.value)}
                  disabled={pending}
                  maxLength={NOTIFICATION_TOPIC_TITLE_MAX_LEN}
                  placeholder="Новости и обновления"
                  autoComplete="off"
                />
              </label>
              <div className="flex items-end sm:justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(index)} disabled={pending}>
                  Удалить
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={pending || rows.length >= NOTIFICATIONS_TOPICS_MAX}>
            Добавить тему
          </Button>
          <Button type="button" variant="default" onClick={() => void handleSave()} disabled={pending}>
            {pending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved ? <span className="text-sm text-green-600">Сохранено</span> : null}
          {error ? <span className="text-sm text-destructive">{error}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
