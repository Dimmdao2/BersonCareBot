"use client";

import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { apiJson } from "@/shared/lib/apiJson";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";
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

const TEMPLATE_AUDIENCE_GROUPS: Array<{ audience: NotifTemplateAudience; title: string }> = [
  { audience: "patient", title: "Уведомления клиенту" },
  { audience: "doctor", title: "Уведомления специалисту" },
];

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
    <div className="flex flex-col gap-3">
      {TEMPLATE_AUDIENCE_GROUPS.map(({ audience, title }) => {
        const groupTemplates = templates.filter((entry) => entry.audience === audience);
        if (groupTemplates.length === 0) return null;

        return (
          <section key={audience} className={doctorSectionCardClass} aria-labelledby={`notification-templates-${audience}`}>
            <h2 id={`notification-templates-${audience}`} className={doctorSectionTitleClass}>
              {title}
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              {groupTemplates.map((entry) => {
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
                        {variables.map((variable) => {
                          const variableLabel = NOTIF_VARIABLE_LABELS[variable] ?? variable;
                          return (
                            <Button
                              key={variable}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => insertVariable(key, variable)}
                              className="rounded-md border border-border/60 bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                              title={`{{${variable}}}`}
                            >
                              {variableLabel}
                            </Button>
                          );
                        })}
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
          </section>
        );
      })}
    </div>
  );
}
