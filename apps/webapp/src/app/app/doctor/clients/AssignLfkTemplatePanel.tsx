"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { assignLfkTemplateFromDoctor } from "./assignLfkTemplateAction";

type TemplateOpt = { id: string; title: string };

export function AssignLfkTemplatePanel({
  patientUserId,
  templates,
  disabled,
}: {
  patientUserId: string;
  templates: TemplateOpt[];
  disabled?: boolean;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  if (disabled || templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {disabled
          ? "Назначение шаблона доступно при подключённой базе данных."
          : "Нет опубликованных комплексов. Создайте и опубликуйте комплекс в разделе «Комплексы»."}
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border/60 p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex min-w-[200px] flex-1 flex-col gap-1">
        <Label htmlFor={`assign-lfk-${patientUserId}`}>Шаблон</Label>
        <select
          id={`assign-lfk-${patientUserId}`}
          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        disabled={pending || !templateId}
        onClick={() => {
          startTransition(async () => {
            const res = await assignLfkTemplateFromDoctor(patientUserId, templateId);
            if (!res.ok) toast.error(res.error);
            else toast.success("Комплекс ЛФК назначен");
          });
        }}
      >
        {pending ? "Назначение…" : "Назначить комплекс ЛФК"}
      </Button>
    </div>
  );
}
