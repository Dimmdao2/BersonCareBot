"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CourseRecord, CourseStatus } from "@/modules/courses/types";

type TemplateOption = { id: string; title: string; status: string };

type IntroOption = { id: string; title: string };

type Props = {
  courseId: string;
  initial: CourseRecord;
  templates: TemplateOption[];
  introPageOptions: IntroOption[];
};

const STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
  { value: "draft", label: "Черновик" },
  { value: "published", label: "Опубликован" },
  { value: "archived", label: "Архив" },
];

export function DoctorCourseEditForm({ courseId, initial, templates, introPageOptions }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [programTemplateId, setProgramTemplateId] = useState(initial.programTemplateId);
  const [introLessonPageId, setIntroLessonPageId] = useState(initial.introLessonPageId ?? "");
  const [status, setStatus] = useState<CourseStatus>(initial.status);
  const [priceMinor, setPriceMinor] = useState(String(initial.priceMinor));
  const [currency, setCurrency] = useState(initial.currency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const t = title.trim();
    if (!t) {
      setError("Введите название курса");
      return;
    }
    const price = Number.parseInt(priceMinor, 10);
    if (!Number.isFinite(price) || price < 0) {
      setError("Цена (коп.) — целое число ≥ 0");
      return;
    }
    const cur = currency.trim();
    if (!cur || cur.length > 8) {
      setError("Валюта — от 1 до 8 символов (например RUB)");
      return;
    }
    if (!programTemplateId) {
      setError("Выберите шаблон программы лечения");
      return;
    }

    const body: Record<string, unknown> = {
      title: t,
      description: description.trim() ? description.trim() : null,
      programTemplateId,
      status,
      priceMinor: price,
      currency: cur,
      introLessonPageId: introLessonPageId.trim() ? introLessonPageId.trim() : null,
    };

    setPending(true);
    try {
      const res = await fetch(`/api/doctor/courses/${encodeURIComponent(courseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {savedAt ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          Сохранено
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="edit-course-title">Название</Label>
        <Input
          id="edit-course-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={2000}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-course-description">Описание</Label>
        <Textarea
          id="edit-course-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={50000}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-course-template">Шаблон программы лечения</Label>
        <select
          id="edit-course-template"
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={programTemplateId}
          onChange={(e) => setProgramTemplateId(e.target.value)}
          required
        >
          {templates.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.title} ({tm.status})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-course-status">Статус</Label>
        <select
          id="edit-course-status"
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={status}
          onChange={(e) => setStatus(e.target.value as CourseStatus)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-course-intro">Вступительный урок (страница CMS)</Label>
        <select
          id="edit-course-intro"
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={introLessonPageId}
          onChange={(e) => setIntroLessonPageId(e.target.value)}
        >
          <option value="">Не выбран</option>
          {introPageOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Только страницы в секциях lessons / course_lessons.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="edit-course-price">Цена (минорные единицы)</Label>
          <Input
            id="edit-course-price"
            type="number"
            min={0}
            step={1}
            value={priceMinor}
            onChange={(e) => setPriceMinor(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-course-currency">Валюта</Label>
          <Input
            id="edit-course-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            required
            maxLength={8}
            autoComplete="off"
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
