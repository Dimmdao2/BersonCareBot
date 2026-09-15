'use client';

import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Card, CardContent } from '@/shared/ui/doctor/primitives/card';
import type { Exercise } from '@/modules/lfk-exercises/types';
import { cn } from '@/lib/utils';
import { MediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import { exerciseMediaToPreviewUi } from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import { doctorInteractiveSurfaceButtonClass } from '@/shared/ui/doctor/doctorVisual';

type Props = {
  exercise: Exercise;
  /** When set, the whole card acts as a selector (split / mobile sheet layout). */
  onSelect?: (id: string) => void;
  isActive?: boolean;
  /** Сетка из 4 колонок: превью квадратное (высота = ширине ячейки). */
  squarePreview?: boolean;
};

export function ExerciseTileCard({ exercise, onSelect, isActive, squarePreview = false }: Props) {
  const firstMedia = exercise.media[0];
  const inner = (
    <Card
      size="sm"
      className={cn(
        'h-full w-full min-w-0 rounded-[calc(var(--radius-xl)*0.5)] transition-shadow data-[size=sm]:py-1.5',
        isActive && 'ring-1 ring-primary/50 ring-offset-1 ring-offset-background',
      )}
    >
      <CardContent className="flex h-full flex-col gap-1 py-px group-data-[size=sm]/card:px-1.5">
        {/*
          * Место под превью занято ВСЕГДА, даже когда медиа у упражнения нет. Владелец 15.09: «у
          * базовой библиотеки упражнения без превью в плитке не держат размер (надо держать хоть
          * это и тестовые)». Раньше блок превью не рисовался вовсе, и плитка схлопывалась до одной
          * подписи: в общей сетке такие карточки вставали вдвое ниже соседних и ряд рвался. Пустая
          * рамка вместо изображения — не «ошибка превью» (за неё отвечает `MediaThumb` со своим
          * значком), а «изображения нет»: значок приглушён и подписи не несёт.
          */}
        <div
          className={cn(
            'flex w-full items-center justify-center overflow-hidden rounded-[calc(var(--radius-md)*0.5)] border border-border/60 bg-muted/30',
            squarePreview ? 'aspect-square shrink-0' : 'h-[135px] shrink-0',
          )}
        >
          {firstMedia ? (
            <MediaThumb
              media={exerciseMediaToPreviewUi(firstMedia)}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
              sizes="160px"
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground opacity-40" aria-hidden />
          )}
        </div>
        <p className="line-clamp-2 text-center text-xs leading-snug text-foreground">
          {exercise.title}
        </p>
        {exercise.ownerKind === 'platform' ? (
          <p className="text-center text-[10px] leading-tight text-muted-foreground">
            Базовая библиотека
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (onSelect) {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(
          doctorInteractiveSurfaceButtonClass,
          'flex w-full cursor-pointer justify-center rounded-[calc(var(--radius-xl)*0.5)] text-left',
        )}
        onClick={() => onSelect(exercise.id)}
      >
        {inner}
      </Button>
    );
  }

  return (
    <Link
      href={`/app/doctor/exercises/${exercise.id}`}
      className="flex justify-center rounded-[calc(var(--radius-xl)*0.5)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {inner}
    </Link>
  );
}
