'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Play } from 'lucide-react';
import type {
  ExerciseMetricPoint,
  TreatmentProgramInstanceStageItemView,
} from '@/modules/treatment-program/types';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import {
  primaryMediaForStageItem,
  resolveStageItemExerciseLoad,
  stageItemSnapshotTitle,
} from '@/app/app/patient/treatment/stageItemSnapshot';
import { markDoctorProgramDiscussionRead } from '@/app/app/doctor/doctorProgramDiscussionMarkRead';
import { DoctorProgramItemDiscussionDialog } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramItemDiscussionDialog';
import { DoctorExerciseRecommendationsModal } from '@/app/app/doctor/treatment-program-shared/DoctorExerciseRecommendationsModal';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { ExerciseExecutionGraph } from '@/shared/ui/doctor/ExerciseExecutionGraph';
import { doctorMetaTextClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorCatalogMediaStaticThumb } from '@/shared/ui/doctor/media/DoctorCatalogMediaStaticThumb';
import { DoctorExerciseMediaPlayer } from '@/shared/ui/doctor/media/DoctorExerciseMediaPlayer';
import {
  formatChatMessageTimeRu,
  formatChatRelativeDateLabelRu,
} from '@/modules/messaging/messageFormatting';
import { cn } from '@/lib/utils';

type DiscussionResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
};

type MetricsResponse = {
  ok?: boolean;
  points?: ExerciseMetricPoint[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  item: TreatmentProgramInstanceStageItemView;
  unreadCount: number;
  onItemUpdated: (item: TreatmentProgramInstanceStageItemView) => void;
  onMarkedRead: (stageItemId: string) => void;
};

function discussionDateLabel(iso: string): string {
  const day = formatChatRelativeDateLabelRu(iso);
  const time = formatChatMessageTimeRu(iso);
  return [day, time].filter(Boolean).join(', ');
}

function discussionPreviewBody(body: string | null): string {
  const value = body?.trim() ?? '';
  if (!value) return 'Медиафайл';
  return value.replace(/^\d{2}\.\d{2}\.\d{4}\s*/, '').trim() || value;
}

export function DoctorExerciseDetailModal({
  open,
  onOpenChange,
  instanceId,
  item,
  unreadCount,
  onItemUpdated,
  onMarkedRead,
}: Props) {
  const title = stageItemSnapshotTitle(item.snapshot, item.itemType);
  const media = useMemo(() => primaryMediaForStageItem(item), [item]);
  const playableMedia =
    media && (media.mediaType === 'video' || media.mediaType === 'hosted_video') ? media : null;
  const load = resolveStageItemExerciseLoad(item);
  const [videoOpen, setVideoOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const [metrics, setMetrics] = useState<ExerciseMetricPoint[] | null>(null);
  const [metricsError, setMetricsError] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setMetrics(null);
    setMetricsError(false);

    const params = new URLSearchParams({
      instanceId,
      stageItemId: item.id,
      windowDays: String(windowDays),
    });
    void fetch(`/api/doctor/comments/exercise-metrics?${params.toString()}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as MetricsResponse | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.points)) {
          setMetrics([]);
          setMetricsError(true);
          return;
        }
        setMetrics(payload.points);
      })
      .catch(() => {
        if (!active) return;
        setMetrics([]);
        setMetricsError(true);
      });

    return () => {
      active = false;
    };
  }, [instanceId, item.id, open, windowDays]);

  useEffect(() => {
    if (!open || unreadCount <= 0) {
      setUnreadMessages([]);
      setCommentsLoading(false);
      setCommentsError(null);
      return;
    }
    let active = true;
    setCommentsLoading(true);
    setCommentsError(null);

    const path = `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(item.id)}/discussion?limit=50&direction=backward`;
    void fetch(path, { credentials: 'include' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as DiscussionResponse | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.messages)) {
          setUnreadMessages([]);
          setCommentsError('Не удалось загрузить комментарии');
          return;
        }
        const patientMessages = payload.messages
          .filter((message) => message.senderRole === 'patient')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setUnreadMessages(patientMessages.slice(-unreadCount));
      })
      .catch(() => {
        if (!active) return;
        setUnreadMessages([]);
        setCommentsError('Не удалось загрузить комментарии');
      })
      .finally(() => {
        if (active) setCommentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [instanceId, item.id, open, unreadCount]);

  const markAllRead = async () => {
    if (markingRead || unreadCount <= 0) return;
    setMarkingRead(true);
    setCommentsError(null);
    try {
      const result = await markDoctorProgramDiscussionRead({
        instanceId,
        stageItemId: item.id,
      });
      if (!result.ok) {
        setCommentsError(result.error);
        return;
      }
      setUnreadMessages([]);
      onMarkedRead(item.id);
    } finally {
      setMarkingRead(false);
    }
  };

  return (
    <>
      <DoctorModal
        open={open}
        onClose={() => onOpenChange(false)}
        title={title}
        size="lg"
        bodyClassName="space-y-5"
      >
        <section className="grid grid-cols-[minmax(7.5rem,0.85fr)_minmax(0,1.15fr)] items-start gap-3">
          {playableMedia ? (
            <Button
              type="button"
              variant="ghost"
              className="group relative h-auto min-h-0 w-full overflow-hidden rounded-lg border border-border/60 bg-muted/15 p-0 shadow-none"
              onClick={() => setVideoOpen(true)}
              aria-label={`Открыть видео: ${title}`}
            >
              <span className="block aspect-video w-full">
                <DoctorCatalogMediaStaticThumb
                  media={playableMedia}
                  frameClassName="size-full rounded-none bg-muted/15"
                  sizes="160px"
                />
              </span>
              <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
                <span className="flex size-9 items-center justify-center rounded-full bg-card/95 text-primary shadow-sm">
                  <Play className="ml-0.5 size-4" fill="currentColor" aria-hidden />
                </span>
              </span>
            </Button>
          ) : (
            <DoctorCatalogMediaStaticThumb
              media={media}
              frameClassName="aspect-video w-full rounded-lg border border-border/60 bg-muted/15"
              sizes="160px"
            />
          )}

          <div className="min-w-0">
            <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
              <h3 className={doctorSectionTitleClass}>Рекомендации</h3>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-muted-foreground"
                onClick={() => setRecommendationsOpen(true)}
                aria-label="Изменить рекомендации"
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="space-y-1.5 text-sm">
              <p className="text-foreground">
                {load.reps != null || load.sets != null
                  ? `${load.reps ?? '—'} × ${load.sets ?? '—'}`
                  : 'Нагрузка не назначена'}
              </p>
              {load.weightKg != null ? (
                <p className={doctorMetaTextClass}>Вес: {load.weightKg} кг</p>
              ) : null}
              {load.maxPain != null ? (
                <p className={doctorMetaTextClass}>Макс. боль: {load.maxPain}</p>
              ) : null}
              {item.effectiveComment ? (
                <p className={cn(doctorMetaTextClass, 'line-clamp-4 whitespace-pre-line')}>
                  {item.effectiveComment}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 pt-4">
          <h3 className={doctorSectionTitleClass}>Динамика выполнения</h3>
          {metrics === null ? (
            <p className={cn(doctorMetaTextClass, 'mt-3')}>Загрузка…</p>
          ) : metricsError ? (
            <p className="mt-3 text-sm text-destructive">Не удалось загрузить динамику</p>
          ) : (
            <ExerciseExecutionGraph
              className="mt-3"
              metricPoints={metrics}
              dayBars={[]}
              windowDays={windowDays}
              onWindowChange={setWindowDays}
            />
          )}
        </section>

        <section className="border-t border-border/60 pt-4">
          <h3 className={doctorSectionTitleClass}>Комментарии</h3>
          <div className="mt-3">
            {commentsLoading ? (
              <p className={doctorMetaTextClass}>Загрузка…</p>
            ) : commentsError ? (
              <p className="text-sm text-destructive">{commentsError}</p>
            ) : unreadCount <= 0 || unreadMessages.length === 0 ? (
              <p className={doctorMetaTextClass}>Непрочитанных нет</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-border/60 p-0">
                {unreadMessages.map((message) => (
                  <li key={message.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className={doctorMetaTextClass}>{discussionDateLabel(message.createdAt)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-base font-medium text-foreground">
                      {discussionPreviewBody(message.body)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={unreadCount <= 0 || markingRead}
              onClick={() => void markAllRead()}
            >
              {markingRead ? 'Сохранение…' : 'Прочитать все'}
            </Button>
            <Button type="button" onClick={() => setDiscussionOpen(true)}>
              Открыть обсуждение
            </Button>
          </div>
        </section>
      </DoctorModal>

      {playableMedia ? (
        <DoctorModal
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
          title={title}
          size="content"
          bodyClassName="justify-center"
        >
          <DoctorExerciseMediaPlayer media={playableMedia} title={title} />
        </DoctorModal>
      ) : null}

      <DoctorExerciseRecommendationsModal
        open={recommendationsOpen}
        onClose={() => setRecommendationsOpen(false)}
        instanceId={instanceId}
        itemId={item.id}
        exerciseTitle={title}
        media={media}
        initialValue={{
          reps: load.reps,
          sets: load.sets,
          maxPain: load.maxPain,
          weightKg: load.weightKg,
          note: item.effectiveComment?.trim() || null,
        }}
        onSaved={({ item: savedItem }) => {
          if (savedItem) onItemUpdated(savedItem);
        }}
      />

      <DoctorProgramItemDiscussionDialog
        instanceId={instanceId}
        itemId={item.id}
        itemLabel={title}
        open={discussionOpen}
        onOpenChange={setDiscussionOpen}
        onMarkedRead={() => {
          setUnreadMessages([]);
          onMarkedRead(item.id);
        }}
      />
    </>
  );
}
