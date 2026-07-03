"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import type {
  NotifTemplateEvent,
  NotifTemplateAudience,
} from "@/modules/notif-templates/notifTemplatesService";
import { NotificationTemplatesPageClient } from "./NotificationTemplatesPageClient";

type TemplateEntry = {
  event: NotifTemplateEvent;
  audience: NotifTemplateAudience;
  text: string;
  isDefault: boolean;
};

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; templates: TemplateEntry[]; variables: string[] };

/**
 * Загрузчик раздела «Тексты уведомлений» таба «Настройки» (Расписание).
 * Тянет шаблоны из GET /api/doctor/notification-templates (доступ доктор|админ)
 * и отдаёт их редактору NotificationTemplatesPageClient.
 */
export function ScheduleNotificationsSection() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetch("/api/doctor/notification-templates");
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        templates?: TemplateEntry[];
        variables?: string[];
      } | null;
      if (!res.ok || !json?.ok || !json.templates) {
        setState({ phase: "error", message: "Не удалось загрузить тексты уведомлений" });
        return;
      }
      setState({ phase: "ready", templates: json.templates, variables: json.variables ?? [] });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">Загрузка текстов уведомлений…</p>;
  }
  if (state.phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Повторить
        </Button>
      </div>
    );
  }
  return <NotificationTemplatesPageClient templates={state.templates} variables={state.variables} />;
}
