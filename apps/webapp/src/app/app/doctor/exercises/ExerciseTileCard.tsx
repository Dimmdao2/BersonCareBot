"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { VideoThumbnailPreview } from "@/shared/ui/media/VideoThumbnailPreview";

type Props = {
  exercise: Exercise;
  loadLabels: Record<ExerciseLoadType, string>;
};

export function ExerciseTileCard({ exercise, loadLabels }: Props) {
  const firstMedia = exercise.media[0];
  return (
    <Card size="sm" className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-3">
        {firstMedia ? (
          <div className="aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-muted/30">
            {firstMedia.mediaType === "video" ? (
              <VideoThumbnailPreview src={firstMedia.mediaUrl} className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstMedia.mediaUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        ) : null}
        <CardHeader className="p-0">
          <CardTitle className="text-sm leading-snug">
            <Link
              href={`/app/doctor/exercises/${exercise.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {exercise.title}
            </Link>
          </CardTitle>
        </CardHeader>
        <div className="mt-auto flex flex-wrap gap-1 text-xs">
          {exercise.loadType ? <Badge variant="secondary">{loadLabels[exercise.loadType]}</Badge> : null}
          {exercise.difficulty1_10 != null ? (
            <Badge variant="outline">Сложность {exercise.difficulty1_10}/10</Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
