"use client";

import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LfkComplex } from "@/modules/diaries/types";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { lfkCoverToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { patientCardCompactClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

export type LfkComplexCardProps = {
  complex: Pick<
    LfkComplex,
    | "id"
    | "title"
    | "origin"
    | "coverImageUrl"
    | "coverPreviewSmUrl"
    | "coverPreviewMdUrl"
    | "coverPreviewStatus"
    | "coverKind"
  >;
  description?: string | null;
  hasReminder: boolean;
  onBellClick: () => void;
  /** S4.T09: явная ссылка на редактирование расписания (то же действие, что и колокольчик). */
  onEditScheduleClick?: () => void;
};

export function LfkComplexCard({
  complex,
  description,
  hasReminder,
  onBellClick,
  onEditScheduleClick,
}: LfkComplexCardProps) {
  const title = complex.title?.trim() || "—";
  const desc =
    description?.trim() ||
    "Упражнения из вашего комплекса. Отмечайте занятия в блоке выше.";

  const coverThumbMedia = lfkCoverToPreviewUi(complex);

  return (
    <Card className={cn(patientCardCompactClass, "!p-0 overflow-hidden py-0")}>
      <div className="flex items-stretch gap-3 p-2 sm:gap-3 sm:p-3">
        <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-[var(--patient-border)]/60 bg-[var(--patient-color-primary-soft)]/35 sm:size-[5.25rem]">
          <MediaThumb
            media={coverThumbMedia}
            className="size-full"
            imgClassName="size-full object-cover"
            sizes="72px"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium text-[var(--patient-text-primary)]">{title}</p>
                {complex.origin === "assigned_by_specialist" ? (
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    Назначен врачом
                  </Badge>
                ) : null}
              </div>
              <p className={cn(patientMutedTextClass, "mt-0.5 line-clamp-2")}>{desc}</p>
              {hasReminder && onEditScheduleClick ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium text-[var(--patient-color-primary)]"
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
              className="size-10 shrink-0 rounded-full border border-[var(--patient-border)]/80"
              onClick={onBellClick}
              aria-label={hasReminder ? "Изменить напоминание" : "Создать напоминание"}
              title={hasReminder ? "Напоминание включено" : "Напоминание не настроено"}
            >
              <Bell
                className={cn(
                  "size-5",
                  hasReminder ? "fill-[var(--patient-color-primary)] text-[var(--patient-color-primary)]" : "text-[var(--patient-text-muted)]",
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
