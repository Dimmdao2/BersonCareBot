"use client";

import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LfkComplex } from "@/modules/diaries/types";

export type LfkComplexCardProps = {
  complex: Pick<LfkComplex, "id" | "title" | "origin">;
  description?: string | null;
  coverImageUrl?: string | null;
  hasReminder: boolean;
  onBellClick: () => void;
  /** S4.T09: явная ссылка на редактирование расписания (то же действие, что и колокольчик). */
  onEditScheduleClick?: () => void;
};

function CoverPlaceholder({ label }: { label: string }) {
  const letter = label.trim().slice(0, 1).toUpperCase() || "Л";
  return (
    <div
      className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-muted text-2xl font-semibold text-primary"
      aria-hidden
    >
      {letter}
    </div>
  );
}

export function LfkComplexCard({
  complex,
  description,
  coverImageUrl,
  hasReminder,
  onBellClick,
  onEditScheduleClick,
}: LfkComplexCardProps) {
  const title = complex.title?.trim() || "—";
  const desc =
    description?.trim() ||
    "Упражнения из вашего комплекса. Отмечайте занятия в блоке выше.";

  return (
    <Card className="overflow-hidden rounded-xl border border-border/80 bg-card py-0 shadow-sm">
      <div className="flex items-stretch gap-3 p-2 sm:gap-3 sm:p-3">
        <div
          className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted sm:size-[5.25rem]"
          aria-hidden={!coverImageUrl}
        >
          {coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- optional remote / API URLs without image optimizer config
            <img src={coverImageUrl} alt="" className="size-full object-cover" />
          ) : (
            <CoverPlaceholder label={title} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium text-foreground">{title}</p>
                {complex.origin === "assigned_by_specialist" ? (
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    Назначен врачом
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{desc}</p>
              {hasReminder && onEditScheduleClick ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium text-primary"
                  onClick={onEditScheduleClick}
                >
                  Изменить расписание
                </Button>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-full border border-border/80"
              onClick={onBellClick}
              aria-label={hasReminder ? "Изменить напоминание" : "Создать напоминание"}
              title={hasReminder ? "Напоминание включено" : "Напоминание не настроено"}
            >
              <Bell
                className={cn(
                  "size-5",
                  hasReminder ? "fill-primary text-primary" : "text-muted-foreground",
                )}
                strokeWidth={hasReminder ? 1.25 : 2}
              />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
