"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { Exercise } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";

type Props = {
  exercise: Exercise;
  /** When set, the whole card acts as a selector (split / mobile sheet layout). */
  onSelect?: (id: string) => void;
  isActive?: boolean;
};

export function ExerciseTileCard({ exercise, onSelect, isActive }: Props) {
  const firstMedia = exercise.media[0];
  const inner = (
    <Card
      size="sm"
      className={cn(
        "h-full w-full min-w-0 transition-shadow",
        isActive && "ring-1 ring-primary/50 ring-offset-1 ring-offset-background",
      )}
    >
      <CardContent className="flex h-full flex-col gap-1 p-0.5">
        {firstMedia ? (
          <div className="h-[135px] w-full overflow-hidden rounded-md border border-border/60 bg-muted/30">
            <MediaThumb
              media={exerciseMediaToPreviewUi(firstMedia)}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
              sizes="160px"
            />
          </div>
        ) : null}
        <p className="line-clamp-2 px-0.5 text-center text-xs leading-snug text-foreground">{exercise.title}</p>
      </CardContent>
    </Card>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer justify-center rounded-xl border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onSelect(exercise.id)}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={`/app/doctor/exercises/${exercise.id}`}
      className="flex justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {inner}
    </Link>
  );
}
