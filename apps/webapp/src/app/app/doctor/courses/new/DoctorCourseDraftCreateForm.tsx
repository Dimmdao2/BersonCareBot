"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PatientHomeCmsReturnQuery } from "@/modules/patient-home/patientHomeCmsReturnUrls";

type TemplateOption = { id: string; title: string; status: string };

type Props = {
  templates: TemplateOption[];
  returnContext: PatientHomeCmsReturnQuery;
};

export function DoctorCourseDraftCreateForm({ templates, returnContext }: Props) {
  const [title, setTitle] = useState("");
  const [programTemplateId, setProgramTemplateId] = useState(templates[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Введите название курса");
      return;
    }
    if (!programTemplateId) {
      setError("Выберите шаблон программы лечения");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/doctor/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          programTemplateId,
          status: "draft",
          accessSettings: {},
          priceMinor: 0,
          currency: "RUB",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; item?: { id: string } };
      if (!res.ok || !data.ok || !data.item?.id) {
        setError(data.error ?? "Не удалось создать курс");
        return;
      }
      setCreatedId(data.item.id);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  if (createdId) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Черновик курса создан</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">id: {createdId}</p>
        <p className="mt-2 text-muted-foreground">
          Добавьте курс в блок «{returnContext.patientHomeBlock}» через «Настроить» на экране главной пациента (кандидаты
          подтягиваются после публикации курса).
        </p>
        <Link
          href={returnContext.returnTo}
          className={cn(buttonVariants({ variant: "secondary" }), "mt-3 inline-flex")}
        >
          Открыть экран «Главная пациента»
        </Link>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Нет шаблонов программ лечения. Сначала создайте шаблон, затем вернитесь сюда.
        </p>
        <Link href="/app/doctor/treatment-program-templates/new" className={cn(buttonVariants({ variant: "outline" }))}>
          Новый шаблон программы
        </Link>
        <div>
          <Link href={returnContext.returnTo} className="text-primary underline">
            Назад к настройке главной
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="course-title">Название курса</Label>
        <Input
          id="course-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={2000}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="course-template">Шаблон программы лечения</Label>
        <select
          id="course-template"
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={programTemplateId}
          onChange={(e) => setProgramTemplateId(e.target.value)}
          required
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.status})
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Курс создаётся как <strong>черновик</strong> через существующий API. Публикация и вступительный урок — в
        карточке курса или API.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Создание…" : "Создать черновик курса"}
      </Button>
    </form>
  );
}
