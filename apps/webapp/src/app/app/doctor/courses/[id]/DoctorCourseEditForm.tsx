"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { USAGE_CONFIRMATION_REQUIRED } from "@/modules/courses/errors";
import type { CourseRecord, CourseStatus, CourseUsageRef, CourseUsageSnapshot } from "@/modules/courses/types";
import { doctorCourseUsageHref } from "../courseUsageDocLinks";
import {
  courseUsageHasSecondaryReferences,
  courseUsageSections,
  type CourseUsageSection,
} from "../courseUsageSummaryText";

type TemplateOption = { id: string; title: string; status: string };

type IntroOption = { id: string; title: string };

type Props = {
  courseId: string;
  initial: CourseRecord;
  templates: TemplateOption[];
  introPageOptions: IntroOption[];
  externalUsageSnapshot?: CourseUsageSnapshot;
};

const STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
  { value: "draft", label: "Черновик" },
  { value: "published", label: "Опубликован" },
  { value: "archived", label: "Архив" },
];

function CourseUsageSectionsView({ sections }: { sections: CourseUsageSection[] }) {
  return (
    <div className="mt-2 space-y-3">
      {sections.map((sec) => (
        <div key={sec.key}>
          <p className="text-sm text-muted-foreground">{sec.summary}</p>
          {sec.refs.length > 0 ? (
            <ul className="mt-1 ml-3 list-disc space-y-0.5 text-sm">
              {sec.refs.map((r: CourseUsageRef) => (
                <li key={`${sec.key}-${r.kind}-${r.id}`}>
                  <Link
                    href={doctorCourseUsageHref(r)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {sec.total > sec.refs.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Показаны первые {sec.refs.length} из {sec.total}.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function DoctorCourseEditForm({
  courseId,
  initial,
  templates,
  introPageOptions,
  externalUsageSnapshot,
}: Props) {
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

  const [usage, setUsage] = useState<CourseUsageSnapshot | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnUsage, setWarnUsage] = useState<CourseUsageSnapshot | null>(null);

  useEffect(() => {
    setTitle(initial.title);
    setDescription(initial.description ?? "");
    setProgramTemplateId(initial.programTemplateId);
    setIntroLessonPageId(initial.introLessonPageId ?? "");
    setStatus(initial.status);
    setPriceMinor(String(initial.priceMinor));
    setCurrency(initial.currency);
    setSavedAt(null);
    setError(null);
    setWarnOpen(false);
    setWarnUsage(null);
  }, [initial]);

  useEffect(() => {
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      setUsageLoadError(null);
      setUsageBusy(false);
      return;
    }
    let cancelled = false;
    setUsageBusy(true);
    setUsageLoadError(null);
    void fetch(`/api/doctor/courses/${encodeURIComponent(courseId)}/usage`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; usage?: CourseUsageSnapshot };
        if (!cancelled) {
          if (res.ok && json.ok && json.usage) setUsage(json.usage);
          else {
            setUsage(null);
            setUsageLoadError("Не удалось загрузить сводку использования");
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsage(null);
          setUsageLoadError("Не удалось загрузить сводку использования");
        }
      })
      .finally(() => {
        if (!cancelled) setUsageBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, externalUsageSnapshot]);

  const usageSections = usage ? courseUsageSections(usage) : [];

  async function persistToServer(acknowledgeArchive: boolean): Promise<{
    ok: boolean;
    error?: string;
    code?: string;
    usage?: CourseUsageSnapshot;
  }> {
    const t = title.trim();
    const price = Number.parseInt(priceMinor, 10);
    const cur = currency.trim();
    const body: Record<string, unknown> = {
      title: t,
      description: description.trim() ? description.trim() : null,
      programTemplateId,
      status,
      priceMinor: price,
      currency: cur,
      introLessonPageId: introLessonPageId.trim() ? introLessonPageId.trim() : null,
    };
    const transitioningToArchived = status === "archived" && initial.status !== "archived";
    if (transitioningToArchived && acknowledgeArchive) {
      body.acknowledgeUsageWarning = true;
    }

    const res = await fetch(`/api/doctor/courses/${encodeURIComponent(courseId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      code?: string;
      usage?: CourseUsageSnapshot;
    };

    if (res.status === 409 && data.code === USAGE_CONFIRMATION_REQUIRED && data.usage) {
      return { ok: false, code: data.code, usage: data.usage };
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: typeof data.error === "string" ? data.error : "Не удалось сохранить" };
    }
    return { ok: true };
  }

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

    const transitioningToArchived = status === "archived" && initial.status !== "archived";

    setPending(true);
    try {
      const first = await persistToServer(false);
      if (!first.ok && transitioningToArchived && first.code === USAGE_CONFIRMATION_REQUIRED && first.usage) {
        setWarnUsage(first.usage);
        setWarnOpen(true);
        return;
      }
      if (!first.ok) {
        setError(first.error ?? "Не удалось сохранить");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
      if (externalUsageSnapshot === undefined) {
        void fetch(`/api/doctor/courses/${encodeURIComponent(courseId)}/usage`)
          .then(async (res) => {
            const json = (await res.json()) as { ok?: boolean; usage?: CourseUsageSnapshot };
            if (res.ok && json.ok && json.usage) setUsage(json.usage);
          })
          .catch(() => {});
      }
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  async function confirmArchiveDialog() {
    setPending(true);
    setError(null);
    try {
      const r = await persistToServer(true);
      if (!r.ok) {
        setError(r.error ?? "Не удалось отправить курс в архив");
        return;
      }
      setWarnOpen(false);
      setWarnUsage(null);
      setSavedAt(Date.now());
      router.refresh();
      if (externalUsageSnapshot === undefined) {
        void fetch(`/api/doctor/courses/${encodeURIComponent(courseId)}/usage`)
          .then(async (res) => {
            const json = (await res.json()) as { ok?: boolean; usage?: CourseUsageSnapshot };
            if (res.ok && json.ok && json.usage) setUsage(json.usage);
          })
          .catch(() => {});
      }
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  const warnSections = warnUsage ? courseUsageSections(warnUsage) : [];

  return (
    <>
      <section className="rounded-md border border-border/60 bg-card/20 p-3">
        <h2 className="text-sm font-semibold">Где используется курс</h2>
        {usageBusy ? (
          <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
        ) : usageLoadError ? (
          <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
        ) : usage ? (
          <>
            <CourseUsageSectionsView sections={usageSections} />
            {!courseUsageHasSecondaryReferences(usage) ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Нет опубликованных промо-страниц с привязкой к этому курсу и нет активных программ по шаблону
                (завершённые программы и черновики страниц ниже не требуют подтверждения при переводе курса в
                архив).
              </p>
            ) : null}
          </>
        ) : null}
      </section>

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

      <Dialog
        open={warnOpen}
        onOpenChange={(o) => {
          setWarnOpen(o);
          if (!o) setWarnUsage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить курс в архив?</DialogTitle>
            <DialogDescription>
              Есть активные программы у пациентов по шаблону этого курса или опубликованные страницы контента с
              привязкой к курсу. В архиве курс не показывается в каталоге; связи шаблона и записи пациентов в базе не
              удаляются.
            </DialogDescription>
          </DialogHeader>
          <CourseUsageSectionsView sections={warnSections} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWarnOpen(false)}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirmArchiveDialog()}>
              В архив, с подтверждением
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
