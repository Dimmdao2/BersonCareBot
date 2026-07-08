"use client";

import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import { ExerciseListCatalogThumb } from "@/shared/ui/doctor/media/ExerciseListCatalogThumb";
import { thumbToExerciseMedia } from "./exerciseCommentThumb";

export function ExerciseCommentPreviewItemContent({
  item,
  isOnSupport,
}: {
  item: TodayExerciseCommentAttentionItem;
  isOnSupport?: boolean;
}) {
  const bodyPreview = item.latestMessage.body?.trim() || "Комментарий без текста";

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <ExerciseListCatalogThumb media={thumbToExerciseMedia(item.thumb)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {item.patientDisplayName}
            {isOnSupport ? (
              <span className="ml-1.5 text-[10px] font-semibold text-primary" title="На сопровождении">
                ★
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {item.latestMessageAtLabel}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-foreground/80">
          {bodyPreview}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.stageItemTitle}
        </p>
      </div>
    </div>
  );
}
