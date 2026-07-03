"use client";

import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { apiJson } from "@/shared/lib/apiJson";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import type {
  NotifTemplateEvent,
  NotifTemplateAudience,
} from "@/modules/notif-templates/notifTemplatesService";
import {
  notifTemplateTitle,
  NOTIF_VARIABLE_LABELS,
} from "./notifTemplateLabels";

type TemplateEntry = {
  event: NotifTemplateEvent;
  audience: NotifTemplateAudience;
  text: string;
  isDefault: boolean;
};

type Props = {
  templates: TemplateEntry[];
  variables: string[];
};

function templateKey(event: NotifTemplateEvent, audience: NotifTemplateAudience): string {
  return `${event}:${audience}`;
}

export function NotificationTemplatesPageClient({ templates, variables }: Props) {
  const initialText = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of templates) map[templateKey(t.event, t.audience)] = t.text;
    return map;
  }, [templates]);

  const [values, setValues] = useState<Record<string, string>>(initialText);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  function setValue(key: string, text: string) {
    setValues((prev) => ({ ...prev, [key]: text }));
  }

  function insertVariable(key: string, variable: string) {
    const token = `{{${variable}}}`;
    const el = textareaRefs.current[key];
    const current = values[key] ?? "";
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const next = current.slice(0, start) + token + current.slice(end);
      setValue(key, next);
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + token.length;
        el.setSelectionRange(caret, caret);
      });
    } else {
      setValue(key, current + token);
    }
  }

  async function save(entry: TemplateEntry) {
    const key = templateKey(entry.event, entry.audience);
    const text = (values[key] ?? "").trim();
    if (!text) {
      toast.error("Текст не может быть пустым");
      return;
    }
    setSavingKey(key);
    try {
      await apiJson("/api/doctor/notification-templates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: entry.event, audience: entry.audience, text }),
      });
      toast.success("Сохранено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Тексты сообщений, которые отправляются при событиях записи. Вставляйте переменные чипами ниже —
        они подставятся реальными значениями. Пустое поле нельзя сохранить; пока текст не менялся,
        используется значение по умолчанию.
      </p>

      <div className={BOOKING_CARD_GRID_CLASS}>
        {templates.map((entry) => {
          const key = templateKey(entry.event, entry.audience);
          const value = values[key] ?? "";
          const dirty = value !== (initialText[key] ?? "");
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-sm">
                  {notifTemplateTitle(entry.event, entry.audience)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  ref={(el) => {
                    textareaRefs.current[key] = el;
                  }}
                  value={value}
                  onChange={(e) => setValue(key, e.target.value)}
                  rows={4}
                  aria-label={notifTemplateTitle(entry.event, entry.audience)}
                />

                <div className="flex flex-wrap gap-1.5">
                  {variables.map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      onClick={() => insertVariable(key, variable)}
                      className="rounded-md border border-border/60 bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                      title={NOTIF_VARIABLE_LABELS[variable] ?? variable}
                    >
                      {`{{${variable}}}`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {entry.isDefault && !dirty ? "по умолчанию" : ""}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => save(entry)}
                    disabled={savingKey === key || value.trim().length === 0}
                  >
                    {savingKey === key ? "Сохранение…" : "Сохранить"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
