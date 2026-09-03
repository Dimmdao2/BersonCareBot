'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Play } from 'lucide-react';
import type {
  ExerciseMetricPoint,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageItemView,
} from '@/modules/treatment-program/types';
import { effectiveInstanceStageItemComment } from '@/modules/treatment-program/types';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import {
  INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE,
  INSTANCE_EDITOR_LOAD_REPS_RANGE,
  INSTANCE_EDITOR_LOAD_SETS_RANGE,
  parseInstanceEditorLoadField,
} from '@/app/app/doctor/treatment-program-shared/instanceEditorLoadSettings';
import {
  primaryMediaForStageItem,
  resolveStageItemExerciseLoad,
  stageItemSnapshotTitle,
} from '@/app/app/patient/treatment/stageItemSnapshot';
import { markDoctorProgramDiscussionRead } from '@/app/app/doctor/doctorProgramDiscussionMarkRead';
import { DoctorProgramItemDiscussionDialog } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramItemDiscussionDialog';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { ExerciseExecutionGraph } from '@/shared/ui/doctor/ExerciseExecutionGraph';
import {
  doctorMetaTextClass,
  doctorSectionTitleClass,
} from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { DoctorCatalogMediaStaticThumb } from '@/shared/ui/doctor/media/DoctorCatalogMediaStaticThumb';
import { DoctorMediaPlaybackVideo } from '@/shared/ui/doctor/media/DoctorMediaPlaybackVideo';
import { HostedVideoEmbed } from '@/shared/ui/doctor/media/HostedVideoEmbed';
import { NoContextMenuVideo } from '@/shared/ui/doctor/media/NoContextMenuVideo';
import { parseMediaFileIdFromAppUrl } from '@/shared/lib/mediaPreviewUrls';
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

type PatchStageItemResponse = {
  ok?: boolean;
  error?: string;
  item?: TreatmentProgramInstanceStageItemRow;
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

function toViewItem(row: TreatmentProgramInstanceStageItemRow): TreatmentProgramInstanceStageItemView {
  return {
    ...row,
    effectiveComment: effectiveInstanceStageItemComment(row),
  };
}

async function patchStageItem(
  instanceId: string,
  itemId: string,
  body: Record<string, unknown>,
): Promise<TreatmentProgramInstanceStageItemView> {
  const response = await fetch(
    `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json().catch(() => null)) as PatchStageItemResponse | null;
  if (!response.ok || !payload?.ok || !payload.item) {
    throw new Error(payload?.error ?? 'Не удалось сохранить назначение');
  }
  return toViewItem(payload.item);
}

function ExerciseVideoPlayer({
  media,
  title,
}: {
  media: NonNullable<ReturnType<typeof primaryMediaForStageItem>>;
  title: string;
}) {
  if (media.mediaType === 'hosted_video') {
    return <HostedVideoEmbed url={media.mediaUrl} title={title} />;
  }

  const mediaId = parseMediaFileIdFromAppUrl(media.mediaUrl);
  if (mediaId) {
    return (
      <DoctorMediaPlaybackVideo
        mediaId={mediaId}
        mp4Url={media.mediaUrl}
        title={title}
        initialPlayback={null}
        shellClassName="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      />
    );
  }

  return (
    <NoContextMenuVideo
      controls
      preload="metadata"
      className="aspect-video w-full rounded-lg bg-black object-contain"
    >
      <source src={media.mediaUrl} />
    </NoContextMenuVideo>
  );
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
  const media = useMemo(
    () => primaryMediaForStageItem(item),
    [item],
  );
  const playableMedia =
    media && (media.mediaType === 'video' || media.mediaType === 'hosted_video') ? media : null;
  const load = resolveStageItemExerciseLoad(item);
  const [videoOpen, setVideoOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState(load.reps == null ? '' : String(load.reps));
  const [sets, setSets] = useState(load.sets == null ? '' : String(load.sets));
  const [maxPain, setMaxPain] = useState(load.maxPain == null ? '' : String(load.maxPain));
  const [note, setNote] = useState(item.effectiveComment ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const resetDraft = () => {
    const currentLoad = resolveStageItemExerciseLoad(item);
    setReps(currentLoad.reps == null ? '' : String(currentLoad.reps));
    setSets(currentLoad.sets == null ? '' : String(currentLoad.sets));
    setMaxPain(currentLoad.maxPain == null ? '' : String(currentLoad.maxPain));
    setNote(item.effectiveComment ?? '');
    setSaveError(null);
  };

  const cancelEditing = () => {
    resetDraft();
    setEditing(false);
  };

  const saveAssignment = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextLoad = {
        reps: parseInstanceEditorLoadField(reps, 'Повторы', INSTANCE_EDITOR_LOAD_REPS_RANGE),
        sets: parseInstanceEditorLoadField(sets, 'Подходы', INSTANCE_EDITOR_LOAD_SETS_RANGE),
        maxPain: parseInstanceEditorLoadField(
          maxPain,
          'Макс. боль',
          INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE,
        ),
      };
      let currentItem = item;
      if (
        nextLoad.reps !== load.reps ||
        nextLoad.sets !== load.sets ||
        nextLoad.maxPain !== load.maxPain
      ) {
        currentItem = await patchStageItem(instanceId, item.id, { loadSettings: nextLoad });
        onItemUpdated(currentItem);
      }

      const normalizedNote = note.trim();
      if (normalizedNote !== (item.effectiveComment ?? '').trim()) {
        currentItem = await patchStageItem(instanceId, item.id, {
          localComment: normalizedNote || null,
        });
        onItemUpdated(currentItem);
      }
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить назначение');
    } finally {
      setSaving(false);
    }
  };

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
              <h3 className={doctorSectionTitleClass}>Назначение</h3>
              {!editing ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() => {
                    resetDraft();
                    setEditing(true);
                  }}
                  aria-label="Изменить назначение"
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>

            {editing ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor={`overview-exercise-reps-${item.id}`} className={doctorMetaTextClass}>
                    Повторы
                  </Label>
                  <Input
                    id={`overview-exercise-reps-${item.id}`}
                    inputMode="numeric"
                    value={reps}
                    onChange={(event) => setReps(event.target.value)}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label htmlFor={`overview-exercise-sets-${item.id}`} className={doctorMetaTextClass}>
                    Подходы
                  </Label>
                  <Input
                    id={`overview-exercise-sets-${item.id}`}
                    inputMode="numeric"
                    value={sets}
                    onChange={(event) => setSets(event.target.value)}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label htmlFor={`overview-exercise-pain-${item.id}`} className={doctorMetaTextClass}>
                    Боль
                  </Label>
                  <Input
                    id={`overview-exercise-pain-${item.id}`}
                    inputMode="numeric"
                    value={maxPain}
                    onChange={(event) => setMaxPain(event.target.value)}
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label htmlFor={`overview-exercise-note-${item.id}`} className={doctorMetaTextClass}>
                    Заметка врача
                  </Label>
                  <Textarea
                    id={`overview-exercise-note-${item.id}`}
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                {saveError ? (
                  <p className="col-span-3 text-sm text-destructive">{saveError}</p>
                ) : null}
                <div className="col-span-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" onClick={cancelEditing} disabled={saving}>
                    Отмена
                  </Button>
                  <Button type="button" onClick={() => void saveAssignment()} disabled={saving}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-sm">
                <p className="text-foreground">
                  {load.reps != null || load.sets != null
                    ? `${load.reps ?? '—'} × ${load.sets ?? '—'}`
                    : 'Повторы и подходы не указаны'}
                </p>
                {load.maxPain != null ? (
                  <p className={doctorMetaTextClass}>Макс. боль: {load.maxPain}</p>
                ) : null}
                {item.effectiveComment ? (
                  <p className={cn(doctorMetaTextClass, 'line-clamp-4 whitespace-pre-line')}>
                    {item.effectiveComment}
                  </p>
                ) : null}
              </div>
            )}
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
          <ExerciseVideoPlayer media={playableMedia} title={title} />
        </DoctorModal>
      ) : null}

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
