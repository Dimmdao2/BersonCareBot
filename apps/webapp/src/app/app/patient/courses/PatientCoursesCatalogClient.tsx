"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { routePaths } from "@/app-layer/routes/paths";
import type { CourseCatalogItem } from "@/modules/courses/types";
import { cn } from "@/lib/utils";

function formatPrice(minor: number, currency: string): string {
  const major = minor / 100;
  const n = major.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (currency === "RUB") return `${n} ₽`;
  return `${n} ${currency}`;
}

export function PatientCoursesCatalogClient(props: {
  items: CourseCatalogItem[];
  enrollReady: boolean;
  loggedIn: boolean;
}) {
  const { items, enrollReady, loggedIn } = props;
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enroll(courseId: string) {
    setError(null);
    setBusyId(courseId);
    try {
      const res = await fetch(`/api/patient/courses/${encodeURIComponent(courseId)}/enroll`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        instance?: { id?: string };
      };
      if (!res.ok || !data.ok || !data.instance?.id) {
        setError(data.error ?? "Не удалось записаться");
        return;
      }
      router.push(routePaths.patientTreatmentProgram(data.instance.id));
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Пока нет опубликованных курсов.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {items.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <h2 className="text-base font-semibold">{c.title}</h2>
            {c.description ? (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{c.description}</p>
            ) : null}
            <p className="mt-2 text-sm font-medium">{formatPrice(c.priceMinor, c.currency)}</p>
            {c.introContentSlug ? (
              <Link
                href={`/app/patient/content/${encodeURIComponent(c.introContentSlug)}`}
                className="mt-3 inline-block text-sm text-primary underline"
              >
                Вступительный урок
              </Link>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {!loggedIn ? (
                <Link
                  href={`${routePaths.root}?next=${encodeURIComponent(routePaths.patientCourses)}`}
                  className={cn(
                    "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                  )}
                >
                  Войти, чтобы записаться
                </Link>
              ) : !enrollReady ? (
                <Link
                  href={`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.patientCourses)}`}
                  className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
                >
                  Активируйте профиль для записи
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => enroll(c.id)}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {busyId === c.id ? "Запись…" : "Записаться на программу"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
