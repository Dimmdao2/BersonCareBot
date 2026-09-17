'use client';

import { Fragment, type ReactNode } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Activity,
  BookOpen,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Info,
  LockKeyhole,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import { DateTime } from 'luxon';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/ui/doctor/primitives/collapsible';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { TiptapEditor } from '@/shared/ui/doctor/TiptapEditor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStatus,
} from '@/modules/treatment-program/types';
import type { TreatmentProgramTestResultDetailRow } from '@/modules/treatment-program/types';
import { DoctorProgramItemDiscussionDialog } from './DoctorProgramItemDiscussionDialog';
import { DoctorLfkCommentsModal } from '@/app/app/doctor/comments/DoctorLfkCommentsModal';
import {
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramStageStatusRu,
  formatLfkPostSessionDifficultyRu,
} from '@/modules/treatment-program/types';
import { cn } from '@/lib/utils';
import { doctorClientSectionTitleClass } from '@/app/app/doctor/clients/doctorClientCardChrome';
import {
  doctorRecommendationActionabilitySelectItems,
  treatmentProgramGroupSelectNoneItemValue,
  treatmentProgramGroupSelectNoneLabel,
} from '@/shared/ui/doctor/selectOpaqueValueLabels';
import { parseTestSetSnapshotTests } from '@/modules/treatment-program/testSetSnapshotView';
import {
  expectedStageControlDeadlineIsoForPatientUi,
  isTreatmentProgramInstanceSystemStageGroup,
  sortDoctorInstanceStageGroupsForDisplay,
} from '@/modules/treatment-program/stage-semantics';
import {
  isProgramInstanceEditLocked,
  runIfProgramInstanceMutationAllowed,
} from '@/app/app/doctor/treatment-program-shared/programInstanceMutationGuard';
import {
  InstanceEditorDraftProvider,
  useInstanceEditorDraft,
} from '@/app/app/doctor/treatment-program-shared/InstanceEditorDraftContext';
import type { InstanceEditorItemStructuralPatch } from '@/app/app/doctor/treatment-program-shared/instanceEditorDraft';
import {
  INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE,
  INSTANCE_EDITOR_LOAD_REPS_RANGE,
  INSTANCE_EDITOR_LOAD_SETS_RANGE,
  parseInstanceEditorLoadField,
} from '@/app/app/doctor/treatment-program-shared/instanceEditorLoadSettings';
import { InstanceEditorToolbar } from '@/app/app/doctor/treatment-program-shared/InstanceEditorToolbar';
import { InstanceEditorAddStageDialog } from '@/app/app/doctor/treatment-program-shared/InstanceEditorAddStageDialog';
import { InstanceEditorStageOrderDialog } from '@/app/app/doctor/treatment-program-shared/InstanceEditorStageOrderDialog';
import { useInstanceEditorPipelineStageExpansion } from '@/app/app/doctor/treatment-program-shared/useInstanceEditorPipelineStageExpansion';
import { useInstanceEditorUnsavedGate } from '@/app/app/doctor/treatment-program-shared/InstanceEditorUnsavedChangesDialog';
import {
  INSTANCE_HEADER_BG_STAGE_EDITABLE,
  TPL_HEADER_BG_RECOMMENDATIONS,
  instanceGroupHeaderSurfaceStyle,
  tplToolbarTextBtnClass,
} from '@/app/app/doctor/treatment-program-shared/treatmentProgramConstructorShellStyles';
import {
  TreatmentProgramSortableItemShell,
  TreatmentProgramPipelineStagesDnd,
  TreatmentProgramSortablePipelineStage,
  TreatmentProgramStageItemsDnd,
  type TreatmentProgramStageItemsDropPreview,
} from '@/app/app/doctor/treatment-program-shared/TreatmentProgramDndUi';
import {
  computeOrderedItemIdsAfterGroupItemAdjacentSwap,
  planStageItemDndReorder,
  sortByOrderThenId,
} from '@/app/app/doctor/treatment-program-shared/treatmentProgramReorderHelpers';
import {
  InstanceAddLibraryItemDialog,
  TreatmentProgramAddItemSquareButton,
  type InstanceAddLibraryItemSpec,
} from '@/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog';
import type { TreatmentProgramLibraryPickers } from '@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes';
import { doctorProgramTestResultDomId } from '@/app/app/doctor/treatment-program-shared/doctorProgramTestResultDomId';
import { DoctorCatalogMediaStaticThumb } from '@/shared/ui/doctor/media/DoctorCatalogMediaStaticThumb';
import {
  parseRecommendationMediaFromSnapshot,
  pickRecommendationRowPreviewMedia,
  primaryMediaForStageItem,
  resolveStageItemExerciseLoad,
  stageItemSnapshotTitle,
} from '@/app/app/patient/treatment/stageItemSnapshot';
import {
  DoctorExerciseActivityCalendar,
  type DoctorExerciseActivityCalendarDay,
} from '@/shared/ui/doctor/DoctorExerciseActivityCalendar';
import { RichTextDocumentTree } from '@/shared/ui/rich-text/RichTextDocumentTree';
import { parseTiptapRichText } from '@/shared/lib/richText';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { readSafeApiErrorText } from '@/shared/http/apiErrorCode';
import { notificationText } from '@/shared/notifications/notificationText';
import { MediaLibraryPickerDialog } from '@/app/app/doctor/content/MediaLibraryPickerDialog';
import { exerciseMediaTypeFromPick } from '@/app/app/doctor/exercises/exerciseMediaFromLibrary';
import type { RecommendationMediaItem } from '@/modules/recommendations/types';

function itemTitleById(detail: TreatmentProgramInstanceDetail): Map<string, string> {
  const m = new Map<string, string>();
  for (const st of detail.stages) {
    for (const it of st.items) {
      m.set(it.id, stageItemSnapshotTitle(it.snapshot, it.itemType));
    }
  }
  return m;
}

function groupTestResultsByAttempt(rows: TreatmentProgramTestResultDetailRow[]) {
  const m = new Map<string, TreatmentProgramTestResultDetailRow[]>();
  for (const r of rows) {
    const list = m.get(r.attemptId) ?? [];
    list.push(r);
    m.set(r.attemptId, list);
  }
  const groups = [...m.entries()].map(([attemptId, results]) => {
    const head = results[0]!;
    return {
      attemptId,
      results,
      startedAt: head.attemptStartedAt,
      submittedAt: head.attemptSubmittedAt,
      acceptedAt: head.attemptAcceptedAt,
    };
  });
  groups.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return groups;
}

function formatProgramAssignmentMeta(createdAt: string, timeZone: string): string {
  const assigned = new Date(createdAt);
  if (Number.isNaN(assigned.getTime())) return 'Дата назначения не указана';
  const assignedDate = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(assigned);
  const elapsedWeeks = Math.max(
    0,
    Math.floor((Date.now() - assigned.getTime()) / (7 * 24 * 60 * 60 * 1000)),
  );
  return `Назначена ${assignedDate} · ${elapsedWeeks} нед.`;
}

/** Строки тестов из снимка элемента этапа (`tests[]` в JSON снимка). */
function ClinicalTestCatalogSnapshotLines({ snapshot }: { snapshot: Record<string, unknown> }) {
  const lines = parseTestSetSnapshotTests(snapshot);
  if (lines.length === 0) return null;
  return (
    <div className="rounded-md border border-border/50 bg-muted/10 p-2">
      <p className="text-xs font-medium text-muted-foreground">Клинический тест (каталог)</p>
      <ul className="m-0 mt-1 list-none space-y-1.5 p-0">
        {lines.map((t) => (
          <li key={t.testId} className="text-xs">
            <span className="font-medium text-foreground">{t.title ?? t.testId}</span>
            {t.comment ? (
              <span className="text-muted-foreground"> — Комментарий к позиции: {t.comment}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

type InstanceStageT = TreatmentProgramInstanceDetail['stages'][number];
type InstanceStageItemT = InstanceStageT['items'][number];

function isInstanceItemDndEligible(stage: InstanceStageT, item: InstanceStageItemT): boolean {
  if (!item.groupId) return true;
  const g = stage.groups.find((x) => x.id === item.groupId);
  if (!g) return true;
  return !isTreatmentProgramInstanceSystemStageGroup(g);
}

function instanceStageDndItemIds(stage: InstanceStageT): string[] {
  return sortByOrderThenId(stage.items.filter((it) => isInstanceItemDndEligible(stage, it))).map(
    (it) => it.id,
  );
}

function optimisticInstanceStageItemsAfterDnd(
  items: InstanceStageItemT[],
  orderedItemIds: string[],
  activeId: string,
  nextGroupId: string | null,
): InstanceStageItemT[] {
  const orderById = new Map(orderedItemIds.map((id, index) => [id, index]));
  return items.map((item) => {
    const nextOrder = orderById.get(item.id);
    if (nextOrder === undefined) return item;
    return {
      ...item,
      sortOrder: nextOrder,
      groupId: item.id === activeId ? nextGroupId : item.groupId,
    };
  });
}

type InstanceStageItemDropPreviewPlacement = {
  activeId: string;
  groupId: string | null;
  insertIndex: number;
};

function sameInstanceGroupKey(
  item: { groupId: string | null | undefined },
  groupId: string | null,
): boolean {
  return (item.groupId ?? null) === (groupId ?? null);
}

function buildInstanceStageItemDropPreviewPlacement(
  stage: InstanceStageT,
  dropPreview: TreatmentProgramStageItemsDropPreview,
): InstanceStageItemDropPreviewPlacement | null {
  if (!dropPreview) return null;
  const canParticipate = (it: InstanceStageItemT) => isInstanceItemDndEligible(stage, it);
  const plan = planStageItemDndReorder(
    stage.items,
    dropPreview.activeId,
    dropPreview.overId,
    canParticipate,
  );
  if (!plan.ok) return null;
  const previewItems = optimisticInstanceStageItemsAfterDnd(
    stage.items,
    plan.orderedItemIds,
    dropPreview.activeId,
    plan.nextGroupId,
  );
  const targetGroupItems = sortByOrderThenId(
    previewItems.filter((item) => sameInstanceGroupKey(item, plan.nextGroupId)),
  );
  const insertIndex = targetGroupItems.findIndex((item) => item.id === dropPreview.activeId);
  if (insertIndex < 0) return null;
  return { activeId: dropPreview.activeId, groupId: plan.nextGroupId, insertIndex };
}

function InstanceStageItemDropPreviewMarker() {
  return (
    <li
      aria-hidden="true"
      className="list-none rounded-md border border-dashed border-primary/45 bg-primary/5 px-1 py-1.5 transition-all"
    >
      <div className="h-10 rounded-md bg-primary/10" />
    </li>
  );
}

function DoctorInstanceStageItemPreviewBlock(props: { item: InstanceStageItemT }) {
  const { item } = props;
  const media = useMemo(
    () => primaryMediaForStageItem(item as Parameters<typeof primaryMediaForStageItem>[0]),
    [item],
  );
  const frameEmpty =
    'flex size-[70px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/15';
  const frameThumb = 'size-[70px] shrink-0 rounded-md border border-border/60 bg-muted/15';
  if (!media) {
    const icon =
      item.itemType === 'recommendation' ? (
        <MessageSquare className="size-7 text-muted-foreground" aria-hidden />
      ) : item.itemType === 'clinical_test' ? (
        <ClipboardList className="size-7 text-muted-foreground" aria-hidden />
      ) : item.itemType === 'lesson' ? (
        <BookOpen className="size-7 text-muted-foreground" aria-hidden />
      ) : (
        <Activity className="size-7 text-muted-foreground" aria-hidden />
      );
    return (
      <div className={frameEmpty} aria-hidden>
        {icon}
      </div>
    );
  }
  return <DoctorCatalogMediaStaticThumb media={media} frameClassName={frameThumb} sizes="70px" />;
}

function DoctorInstanceStageItemLoadForm(props: { item: InstanceStageItemT; editLocked: boolean }) {
  const { item, editLocked } = props;
  const { patchItemLoadSettings } = useInstanceEditorDraft();
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('');
  const [maxPain, setMaxPain] = useState('');
  /** Валидация полей нагрузки живёт у своей формы; результаты действий — во всплывающем уведомлении. */
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const e = resolveStageItemExerciseLoad({
      itemType: item.itemType,
      settings: item.settings,
      snapshot: item.snapshot,
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync load draft fields when item changes
    setReps(e.reps != null ? String(e.reps) : '');
    setSets(e.sets != null ? String(e.sets) : '');
    setMaxPain(e.maxPain != null ? String(e.maxPain) : '');
    setMsg(null);
  }, [item.id, item.itemType, item.settings, item.snapshot]);

  const applyLoadDraft = (nextReps: string, nextSets: string, nextMaxPain: string) => {
    if (editLocked) return;
    try {
      patchItemLoadSettings(item.id, {
        reps: parseInstanceEditorLoadField(nextReps, 'Повторы', INSTANCE_EDITOR_LOAD_REPS_RANGE),
        sets: parseInstanceEditorLoadField(nextSets, 'Подходы', INSTANCE_EDITOR_LOAD_SETS_RANGE),
        maxPain: parseInstanceEditorLoadField(
          nextMaxPain,
          'Макс. боль',
          INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE,
        ),
      });
      setMsg(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border/50 bg-muted/10 p-3">
      <p className="text-xs font-medium text-muted-foreground">Нагрузка</p>
      <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor={`reps-${item.id}`}>
            Повторы
          </Label>
          <Input
            id={`reps-${item.id}`}
            type="text"
            inputMode="numeric"
            className="h-8 text-xs"
            disabled={editLocked}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={() => applyLoadDraft(reps, sets, maxPain)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor={`sets-${item.id}`}>
            Подходы
          </Label>
          <Input
            id={`sets-${item.id}`}
            type="text"
            inputMode="numeric"
            className="h-8 text-xs"
            disabled={editLocked}
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            onBlur={() => applyLoadDraft(reps, sets, maxPain)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor={`mp-${item.id}`}>
            Макс. боль
          </Label>
          <Input
            id={`mp-${item.id}`}
            type="text"
            inputMode="numeric"
            className="h-8 text-xs"
            disabled={editLocked}
            value={maxPain}
            onChange={(e) => setMaxPain(e.target.value)}
            onBlur={() => applyLoadDraft(reps, sets, maxPain)}
          />
        </div>
      </div>
      {msg ? <p className="text-xs text-destructive">{msg}</p> : null}
    </div>
  );
}

function DoctorPersonalExerciseTitleForm(props: { item: InstanceStageItemT; editLocked: boolean }) {
  const { item, editLocked } = props;
  const { patchItem } = useInstanceEditorDraft();
  const title = stageItemSnapshotTitle(item.snapshot, item.itemType);
  if (item.itemType !== 'exercise' || item.snapshot.exerciseScope !== 'personal') return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`personal-title-${item.id}`}>Название личного упражнения</Label>
      <Input
        id={`personal-title-${item.id}`}
        defaultValue={title}
        disabled={editLocked}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim();
          if (next && next !== title) patchItem(item.id, { personalTitle: next });
        }}
      />
      <p className="text-xs text-muted-foreground">
        Видео закреплено за рекомендацией и не заменяется.
      </p>
    </div>
  );
}

function DoctorProgramInstanceItemCard(props: {
  stage: InstanceStageT;
  item: InstanceStageItemT;
  testResults: TreatmentProgramTestResultDetailRow[];
  programStatus: TreatmentProgramInstanceStatus;
  /** Левая колонка «Рекомендации (этап 0)»: без суффикса типа и без выбора группы. */
  phaseZeroRecommendation?: boolean;
  /** Стрелки порядка внутри группы (или этап 0 — `null`-группа). */
  reorderInGroup?: {
    disableAll: boolean;
    disableUp: boolean;
    disableDown: boolean;
    onMove: (dir: -1 | 1) => void | Promise<void>;
  };
  dragHandle?: ReactNode;
}) {
  const {
    stage,
    item,
    testResults,
    programStatus,
    phaseZeroRecommendation = false,
    reorderInGroup,
    dragHandle,
  } = props;
  const recPhase0 = phaseZeroRecommendation && item.itemType === 'recommendation';
  const editLocked = isProgramInstanceEditLocked(programStatus);
  return (
    <details className="group rounded-lg border border-border/80 bg-background open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        {dragHandle ? (
          <div
            className="shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {dragHandle}
          </div>
        ) : null}
        {reorderInGroup ? (
          <div
            className="shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <DoctorCatalogMediaStaticThumb
              media={primaryMediaForStageItem(
                item as Parameters<typeof primaryMediaForStageItem>[0],
              )}
              frameClassName="h-8 w-8 rounded shrink-0"
              sizes="32px"
              iconClassName="size-4"
            />
          </div>
        ) : null}
        <p className="min-w-0 flex-1 text-sm font-medium">
          <span className="truncate">{stageItemSnapshotTitle(item.snapshot, item.itemType)}</span>{' '}
          {recPhase0 ? null : (
            <span className="font-normal text-muted-foreground">({item.itemType})</span>
          )}
        </p>
        <span className="shrink-0 text-xs text-muted-foreground group-open:hidden">Развернуть</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground group-open:inline">
          Свернуть
        </span>
      </summary>
      <div className="border-t border-border/50 px-3 pb-4 pt-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex shrink-0 justify-center sm:block sm:w-[70px]">
            <DoctorInstanceStageItemPreviewBlock item={item} />
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-4">
            <InstanceStageItemDoctorRow
              item={item}
              editLocked={editLocked}
              groups={stage.groups}
              testResults={testResults}
              hideGroupSelect={recPhase0}
            />
            <DoctorPersonalExerciseTitleForm item={item} editLocked={editLocked} />
            {item.itemType === 'exercise' ? (
              <DoctorInstanceStageItemLoadForm item={item} editLocked={editLocked} />
            ) : null}
            {item.itemType === 'clinical_test' ? (
              <ClinicalTestCatalogSnapshotLines snapshot={item.snapshot} />
            ) : null}
          </div>
        </div>
      </div>
    </details>
  );
}

/** Lifecycle экземпляра программы (не путать с завершением отдельного этапа). */
function ProgramInstanceCompleteControl(props: {
  instanceId: string;
  status: TreatmentProgramInstanceDetail['status'];
  onPatched: () => Promise<void>;
}) {
  const { instanceId, status, onPatched } = props;
  const { runOrPromptSave, unsavedDialog } = useInstanceEditorUnsavedGate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const targetStatus: TreatmentProgramInstanceStatus = status === 'active' ? 'completed' : 'active';
  const completing = targetStatus === 'completed';

  const patchStatus = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus }),
        },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(readSafeApiErrorText(data, notificationText.commonGenericError));
        return;
      }
      setOpen(false);
      await onPatched();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          size="sm"
          variant={completing ? 'destructive' : 'default'}
          className="h-9 w-full min-w-0 whitespace-normal px-2 text-xs sm:text-sm"
          disabled={saving}
          onClick={() => runOrPromptSave(() => setOpen(true))}
        >
          {completing ? 'Завершить программу' : 'Активировать программу'}
        </Button>
      </div>
      {unsavedDialog}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {completing ? 'Завершить программу?' : 'Активировать программу?'}
            </DialogTitle>
            <DialogDescription>
              {completing
                ? 'Программа будет отмечена как завершённая.'
                : 'Программа снова станет активной.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant={completing ? 'destructive' : 'default'}
              disabled={saving}
              onClick={() => void patchStatus()}
            >
              {saving
                ? 'Сохранение…'
                : completing
                  ? 'Завершить программу'
                  : 'Активировать программу'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DoctorInstancePipelineStageBlock(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail['stages'][number];
  programStatus: TreatmentProgramInstanceStatus;
  testResults: TreatmentProgramTestResultDetailRow[];
  onSaved: () => Promise<void>;
  onRequestAddLibraryItem: (spec: InstanceAddLibraryItemSpec) => void;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
}) {
  const {
    instanceId,
    stage,
    programStatus,
    testResults,
    onSaved,
    onRequestAddLibraryItem,
    expanded,
    onExpandedChange,
  } = props;
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const editLocked = isProgramInstanceEditLocked(programStatus);

  return (
    <DoctorSection
      className="overflow-hidden p-0"
      data-testid={`instance-editor-pipeline-stage-${stage.id}`}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <Collapsible open={expanded} onOpenChange={onExpandedChange}>
        <div
          className="border-b border-border/40 px-2 py-1.5"
          style={{ background: INSTANCE_HEADER_BG_STAGE_EDITABLE }}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CollapsibleTrigger
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 pt-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  Этап {stage.sortOrder}
                </span>
                <h3 className="mt-0.5 text-sm font-semibold leading-tight text-foreground">
                  {stage.title}
                </h3>
                {stage.description?.trim() ? (
                  <p className="mt-1 text-xs leading-snug whitespace-pre-wrap text-muted-foreground">
                    {stage.description.trim()}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wide">
                    {formatTreatmentProgramStageStatusRu(stage.status)}
                  </span>
                  {stage.skipReason ? <span>Причина пропуска: {stage.skipReason}</span> : null}
                </div>
              </div>
              <ChevronDown
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-data-[open]/collapsible:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={tplToolbarTextBtnClass}
                disabled={editLocked}
                onClick={() => {
                  if (editLocked) return;
                  onExpandedChange(true);
                  setNewGroupOpen(true);
                }}
              >
                + Группа
              </Button>
            </div>
          </div>
        </div>
        <CollapsibleContent>
          <div className="p-3">
            <StageDoctorControls
              instanceId={instanceId}
              stage={stage}
              programStatus={programStatus}
              onPatched={onSaved}
            />
            <InstanceStageGroupsPanel
              stage={stage}
              testResults={testResults}
              programStatus={programStatus}
              newGroupOpen={newGroupOpen}
              onNewGroupOpenChange={setNewGroupOpen}
              onRequestAddLibraryItem={onRequestAddLibraryItem}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </DoctorSection>
  );
}

function MobileInstanceDraftAutosaveBridge() {
  const { draftRevision, isDirty, saving, saveDraft } = useInstanceEditorDraft();
  const saveDraftRef = useRef(saveDraft);
  const failedRevisionRef = useRef<number | null>(null);
  const pendingDestinationRef = useRef<string | null>(null);
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useLayoutEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    if (!mobile || !isDirty || saving || failedRevisionRef.current === draftRevision) {
      return;
    }
    void saveDraft({ confirmActiveProgramChange: false }).then((result) => {
      if (!result.ok && !result.cancelled) {
        failedRevisionRef.current = draftRevision;
        toast.error(notificationText.commonSaveFailed);
      }
    });
  }, [draftRevision, isDirty, mobile, saveDraft, saving]);

  useEffect(() => {
    if (!isDirty) failedRevisionRef.current = null;
  }, [isDirty]);

  useEffect(() => {
    if (!mobile || !isDirty) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (saving) {
        pendingDestinationRef.current = destination.href;
        return;
      }

      void saveDraftRef.current({ confirmActiveProgramChange: false }).then((result) => {
        if (result.ok) {
          window.location.assign(destination.href);
          return;
        }
        if (!result.cancelled) {
          toast.error(notificationText.commonSaveFailed);
        }
      });
    };

    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [isDirty, mobile, saving]);

  useEffect(() => {
    if (!mobile || saving || isDirty || !pendingDestinationRef.current) return;
    const destination = pendingDestinationRef.current;
    pendingDestinationRef.current = null;
    window.location.assign(destination);
  }, [isDirty, mobile, saving]);

  return saving ? (
    <div className="fixed inset-0 z-[90] cursor-wait md:hidden" aria-label="Сохранение изменений" />
  ) : null;
}

type DiscussionSummary = { totalCount: number; lastMessage?: unknown };
type MobileRecommendationEditDraft = {
  title: string;
  bodyMd: string;
  media: RecommendationMediaItem[];
};

function MobileRecommendationEditor(props: {
  instanceId: string;
  stage: InstanceStageT;
  items: InstanceStageItemT[];
  testResults: TreatmentProgramTestResultDetailRow[];
  programStatus: TreatmentProgramInstanceStatus;
  onAdd: () => void;
}) {
  const { instanceId, stage, items, testResults, programStatus, onAdd } = props;
  const { patchItem, patchItemStructural, deleteItem, setItemReorder, saving } =
    useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const orderedItems = useMemo(() => sortByOrderThenId(items), [items]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MobileRecommendationEditDraft>({
    title: '',
    bodyMd: '',
    media: [],
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [discussionByItemId, setDiscussionByItemId] = useState<Record<string, DiscussionSummary>>(
    {},
  );

  const selected = orderedItems.find((item) => item.id === selectedId) ?? null;
  const editing = orderedItems.find((item) => item.id === editId) ?? null;
  const deleting = orderedItems.find((item) => item.id === deleteId) ?? null;

  const openRecommendationEdit = (item: InstanceStageItemT) => {
    setEditDraft({
      title: stageItemSnapshotTitle(item.snapshot, item.itemType),
      bodyMd: typeof item.snapshot.bodyMd === 'string' ? item.snapshot.bodyMd : '',
      media: parseRecommendationMediaFromSnapshot(item.snapshot),
    });
    setEditId(item.id);
  };

  const saveRecommendationEdit = () => {
    if (!editing) return;
    const title = editDraft.title.trim();
    if (!title) {
      toast.error(notificationText.recommendationNameRequired);
      return;
    }
    patchItem(editing.id, {
      recommendationContent: {
        title,
        bodyMd: editDraft.bodyMd.trim(),
        media: editDraft.media,
      },
    });
    setEditId(null);
  };

  useEffect(() => {
    if (!manageOpen && !selectedId) return;
    const ids = orderedItems.map((item) => item.id).filter((id) => !id.startsWith('draft:'));
    if (ids.length === 0) return;
    const controller = new AbortController();
    void fetch(
      `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/discussion/summary?stageItemIds=${encodeURIComponent(ids.join(','))}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          ok?: boolean;
          summaryByStageItemId?: Record<string, DiscussionSummary>;
        };
      })
      .then((payload) => {
        if (payload?.ok && payload.summaryByStageItemId) {
          setDiscussionByItemId(payload.summaryByStageItemId);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [instanceId, manageOpen, orderedItems, selectedId]);

  const hasHistory = (item: InstanceStageItemT) =>
    Boolean(item.completedAt) ||
    testResults.some((row) => row.instanceStageItemId === item.id) ||
    (discussionByItemId[item.id]?.totalCount ?? 0) > 0;
  const deletionLocked = (item: InstanceStageItemT) =>
    hasHistory(item) ||
    (!item.id.startsWith('draft:') &&
      !Object.prototype.hasOwnProperty.call(discussionByItemId, item.id));

  const patchAndSave = (itemId: string, patch: InstanceEditorItemStructuralPatch) => {
    patchItemStructural(itemId, patch);
  };

  const reorder = (activeId: string, overId: string) => {
    const from = orderedItems.findIndex((item) => item.id === activeId);
    const to = orderedItems.findIndex((item) => item.id === overId);
    if (from < 0 || to < 0) return;
    const recommendationIds = arrayMove(
      orderedItems.map((item) => item.id),
      from,
      to,
    );
    const recommendationSet = new Set(recommendationIds);
    let recommendationIndex = 0;
    const completeOrder = sortByOrderThenId(stage.items).map((item) =>
      recommendationSet.has(item.id) ? recommendationIds[recommendationIndex++]! : item.id,
    );
    setItemReorder(stage.id, completeOrder);
  };

  const confirmDelete = () => {
    if (!deleting || deletionLocked(deleting) || editLocked) return;
    deleteItem(deleting.id);
    setDeleteId(null);
    if (selectedId === deleting.id) setSelectedId(null);
  };

  const recommendationBody = selected
    ? typeof selected.snapshot.bodyMd === 'string'
      ? selected.snapshot.bodyMd
      : ''
    : '';
  const recommendationDocument = recommendationBody
    ? parseTiptapRichText(recommendationBody)
    : null;
  const selectedMedia = selected
    ? pickRecommendationRowPreviewMedia(parseRecommendationMediaFromSnapshot(selected.snapshot))
    : null;

  return (
    <DoctorSection
      className="overflow-hidden p-0 md:hidden"
      id="doctor-program-instance-phase0-recommendations-mobile"
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-border/25 px-2 py-2"
        style={{ background: TPL_HEADER_BG_RECOMMENDATIONS }}
      >
        <h3 className="min-w-0 flex-1 text-sm font-semibold leading-tight text-foreground">
          Общие рекомендации
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            className="size-8"
            aria-label="Добавить рекомендацию"
            disabled={editLocked}
            onClick={onAdd}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Изменить рекомендации"
            disabled={editLocked || orderedItems.length === 0}
            onClick={() => setManageOpen(true)}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <div className="p-2">
        {orderedItems.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">Нет рекомендаций.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border/60 p-0">
            {orderedItems.map((item) => {
              const media = pickRecommendationRowPreviewMedia(
                parseRecommendationMediaFromSnapshot(item.snapshot),
              );
              const active = item.status !== 'disabled';
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center gap-2 px-1 py-1.5 text-left"
                    onClick={() => setSelectedId(item.id)}
                  >
                    {media ? (
                      <DoctorCatalogMediaStaticThumb
                        media={media}
                        frameClassName="size-11 rounded-md border border-border/60"
                        sizes="44px"
                      />
                    ) : null}
                    <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug">
                      {stageItemSnapshotTitle(item.snapshot, item.itemType)}
                    </span>
                    {active ? (
                      <Eye className="size-5 shrink-0 text-emerald-600" aria-label="Показывается" />
                    ) : (
                      <EyeOff
                        className="size-5 shrink-0 text-muted-foreground"
                        aria-label="Скрыто"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected ? stageItemSnapshotTitle(selected.snapshot, selected.itemType) : ''}
            </DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              {selectedMedia ? (
                <a href={selectedMedia.mediaUrl} target="_blank" rel="noreferrer" className="block">
                  <DoctorCatalogMediaStaticThumb
                    media={selectedMedia}
                    frameClassName="aspect-video w-full rounded-lg border border-border"
                    sizes="(max-width: 640px) 92vw, 480px"
                  />
                </a>
              ) : null}
              <div className="markdown-preview text-sm">
                {recommendationDocument ? (
                  <RichTextDocumentTree document={recommendationDocument} />
                ) : recommendationBody ? (
                  <p className="whitespace-pre-wrap">{recommendationBody}</p>
                ) : (
                  <p className="text-muted-foreground">Описание не заполнено.</p>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex-row flex-nowrap justify-between gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={
                !selected || editLocked || saving || (selected ? deletionLocked(selected) : true)
              }
              title={
                selected && deletionLocked(selected)
                  ? 'Есть комментарии или отметки выполнения'
                  : undefined
              }
              onClick={() => selected && setDeleteId(selected.id)}
            >
              Удалить
            </Button>
            <Button
              type="button"
              disabled={!selected || editLocked || saving}
              onClick={() => selected && openRecommendationEdit(selected)}
            >
              Редактировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Общие рекомендации</DialogTitle>
            <DialogDescription>Перетащите строки, чтобы изменить порядок.</DialogDescription>
          </DialogHeader>
          <TreatmentProgramStageItemsDnd
            sortableItemIds={orderedItems.map((item) => item.id)}
            disabled={editLocked || saving}
            onReorder={reorder}
          >
            <div className="space-y-2">
              {orderedItems.map((item) => {
                const media = pickRecommendationRowPreviewMedia(
                  parseRecommendationMediaFromSnapshot(item.snapshot),
                );
                const active = item.status !== 'disabled';
                const deleteDisabled = deletionLocked(item);
                return (
                  <TreatmentProgramSortableItemShell
                    key={item.id}
                    id={item.id}
                    disabled={editLocked || saving}
                    className="rounded-lg border border-border bg-background p-2"
                    dragHandleClassName="size-11"
                  >
                    {(dragHandle) => (
                      <div className="flex min-h-[4.75rem] items-center gap-2">
                        {dragHandle}
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <DoctorCatalogMediaStaticThumb
                              media={media}
                              frameClassName="size-10 rounded-md border border-border/60"
                              sizes="40px"
                            />
                            <p className="min-w-0 flex-1 truncate text-sm font-medium">
                              {stageItemSnapshotTitle(item.snapshot, item.itemType)}
                            </p>
                          </div>
                          <div className="mt-1 flex justify-end gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9"
                              aria-label={active ? 'Скрыть' : 'Показать'}
                              disabled={editLocked || saving}
                              onClick={() =>
                                patchAndSave(item.id, {
                                  status: active ? 'disabled' : 'active',
                                })
                              }
                            >
                              {active ? (
                                <Eye className="size-5 text-emerald-600" />
                              ) : (
                                <EyeOff className="size-5 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9"
                              aria-label="Редактировать"
                              disabled={editLocked || saving}
                              onClick={() => openRecommendationEdit(item)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9 text-destructive"
                              aria-label="Удалить"
                              disabled={editLocked || saving || deleteDisabled}
                              title={
                                deleteDisabled
                                  ? 'Есть комментарии или отметки выполнения'
                                  : undefined
                              }
                              onClick={() => setDeleteId(item.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </TreatmentProgramSortableItemShell>
                );
              })}
            </div>
          </TreatmentProgramStageItemsDnd>
          <DialogFooter className="flex-row flex-nowrap justify-end">
            <Button type="button" onClick={() => setManageOpen(false)}>
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактирование рекомендации</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="mobile-recommendation-title">Название</Label>
                <Input
                  id="mobile-recommendation-title"
                  value={editDraft.title}
                  maxLength={2000}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Медиа</Label>
                <MediaLibraryPickerDialog
                  kind="image_or_video"
                  value={editDraft.media[0]?.mediaUrl ?? ''}
                  selectedPreviewKind={
                    editDraft.media[0]?.mediaType === 'hosted_video'
                      ? 'video'
                      : editDraft.media[0]?.mediaType
                  }
                  pickerTitle="Изображение, GIF или видео"
                  onChange={(url, meta) =>
                    setEditDraft((current) => ({
                      ...current,
                      media:
                        url && meta
                          ? [
                              {
                                mediaUrl: url,
                                mediaType: exerciseMediaTypeFromPick(meta),
                                sortOrder: 0,
                              },
                            ]
                          : [],
                    }))
                  }
                />
              </div>
              <TiptapEditor
                name={`mobile_recommendation_body_${editing.id}`}
                label="Описание"
                helpText={null}
                value={editDraft.bodyMd}
                onChange={(bodyMd) => setEditDraft((current) => ({ ...current, bodyMd }))}
                minHeight={160}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() =>
                  patchAndSave(editing.id, {
                    status: editing.status === 'disabled' ? 'active' : 'disabled',
                  })
                }
              >
                {editing.status === 'disabled' ? 'Показать пациенту' : 'Скрыть от пациента'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() =>
                  patchAndSave(editing.id, { isActionable: editing.isActionable === false })
                }
              >
                {editing.isActionable === false ? 'Сделать выполняемой' : 'Сделать постоянной'}
              </Button>
            </div>
          ) : null}
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditId(null)}>
              Отмена
            </Button>
            <Button type="button" disabled={!editing || saving} onClick={saveRecommendationEdit}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить рекомендацию?</DialogTitle>
            <DialogDescription>
              Рекомендация будет удалена из программы без возможности восстановления.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-nowrap justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DoctorSection>
  );
}

function mobileStageDurationLabel(stage: InstanceStageT, timeZone: string): string | null {
  const parts: string[] = [];
  if (stage.expectedDurationText?.trim()) parts.push(stage.expectedDurationText.trim());
  else if (stage.expectedDurationDays != null) parts.push(`${stage.expectedDurationDays} дн.`);
  if (stage.status === 'in_progress' && stage.expectedDurationDays != null) {
    const dueIso = expectedStageControlDeadlineIsoForPatientUi(stage, DateTime.now(), timeZone);
    if (dueIso) {
      parts.push(
        `до ${new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'long',
          timeZone,
        }).format(new Date(dueIso))}`,
      );
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function MobileStageCalendarDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientUserId: string;
  instanceId: string;
  stage: InstanceStageT | null;
  timeZone: string;
}) {
  const { open, onOpenChange, patientUserId, instanceId, stage, timeZone } = props;
  const now = DateTime.now().setZone(timeZone);
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [days, setDays] = useState<DoctorExerciseActivityCalendarDay[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');

  useEffect(() => {
    if (!open || !stage) return;
    const last = new Date(year, month, 0).getDate();
    const pad = (value: number) => String(value).padStart(2, '0');
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(last)}`;
    const controller = new AbortController();
    queueMicrotask(() => setState('loading'));
    void fetch(
      `/api/doctor/patients/${encodeURIComponent(patientUserId)}/exercise-calendar?from=${from}&to=${to}&instanceId=${encodeURIComponent(instanceId)}&stageId=${encodeURIComponent(stage.id)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('calendar');
        return (await response.json()) as {
          ok?: boolean;
          days?: DoctorExerciseActivityCalendarDay[];
        };
      })
      .then((payload) => {
        if (!payload.ok || !Array.isArray(payload.days)) throw new Error('calendar');
        setDays(payload.days);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDays([]);
        setState('error');
      });
    return () => controller.abort();
  }, [instanceId, month, open, patientUserId, stage, year]);

  const currentMonth = year === now.year && month === now.month;
  const navigate = (delta: -1 | 1) => {
    if (delta === 1 && currentMonth) return;
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Календарь выполнения</DialogTitle>
          <DialogDescription>{stage?.title ?? ''}</DialogDescription>
        </DialogHeader>
        <DoctorExerciseActivityCalendar
          days={days}
          year={year}
          month={month}
          state={state}
          disableNext={currentMonth}
          onMonthChange={navigate}
        />
      </DialogContent>
    </Dialog>
  );
}

function MobileProgramStagesEditor(props: {
  detail: TreatmentProgramInstanceDetail;
  pipelineStages: InstanceStageT[];
  stageZeroId: string | null;
  testResults: TreatmentProgramTestResultDetailRow[];
  appDisplayTimeZone: string;
  onAddGroupItem: (spec: InstanceAddLibraryItemSpec) => void;
  onRefresh: () => Promise<void>;
}) {
  const {
    detail,
    pipelineStages,
    stageZeroId,
    testResults,
    appDisplayTimeZone,
    onAddGroupItem,
    onRefresh,
  } = props;
  const { setStageOrder, addGroupCreate, patchStageMetadata, isDirty, saveDraft } =
    useInstanceEditorDraft();
  const { saving: draftSaving } = useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(detail.status);
  const [groupTarget, setGroupTarget] = useState<{ stageId: string; groupId: string } | null>(null);
  const [newGroupStageId, setNewGroupStageId] = useState<string | null>(null);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [stageEditId, setStageEditId] = useState<string | null>(null);
  const [stageInfoId, setStageInfoId] = useState<string | null>(null);
  const [calendarStageId, setCalendarStageId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<InstanceStageT | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [stageDraft, setStageDraft] = useState({
    title: '',
    description: '',
    goals: '',
    objectives: '',
    days: '',
    durationText: '',
  });

  const editingStage = pipelineStages.find((stage) => stage.id === stageEditId) ?? null;
  const infoStage = pipelineStages.find((stage) => stage.id === stageInfoId) ?? null;
  const calendarStage = pipelineStages.find((stage) => stage.id === calendarStageId) ?? null;
  const groupStage = groupTarget
    ? (pipelineStages.find((stage) => stage.id === groupTarget.stageId) ?? null)
    : null;
  const group = groupStage?.groups.find((row) => row.id === groupTarget?.groupId) ?? null;

  useEffect(() => {
    if (!editingStage) return;
    setStageDraft({
      title: editingStage.title,
      description: editingStage.description ?? '',
      goals: editingStage.goals ?? '',
      objectives: editingStage.objectives ?? '',
      days:
        editingStage.expectedDurationDays == null ? '' : String(editingStage.expectedDurationDays),
      durationText: editingStage.expectedDurationText ?? '',
    });
  }, [editingStage]);

  const reorderStages = (activeId: string, overId: string) => {
    const ids = pipelineStages.map((stage) => stage.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || !stageZeroId) return;
    setStageOrder([stageZeroId, ...arrayMove(ids, from, to)]);
  };

  const createGroup = () => {
    const title = newGroupTitle.trim();
    if (!newGroupStageId || !title || editLocked) return;
    addGroupCreate({ stageId: newGroupStageId, title });
    setNewGroupStageId(null);
    setNewGroupTitle('');
  };

  const saveStage = () => {
    if (!editingStage || !stageDraft.title.trim()) return;
    const parsedDays = stageDraft.days.trim() === '' ? null : Number(stageDraft.days);
    if (
      parsedDays !== null &&
      (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 36500)
    ) {
      toast.error(notificationText.treatmentProgramExpectedDaysInvalid);
      return;
    }
    patchStageMetadata(editingStage.id, {
      title: stageDraft.title.trim(),
      description: stageDraft.description.trim() || null,
      goals: stageDraft.goals.trim() || null,
      objectives: stageDraft.objectives.trim() || null,
      expectedDurationDays: parsedDays,
      expectedDurationText: stageDraft.durationText.trim() || null,
    });
    setStageEditId(null);
  };

  const activateStage = async () => {
    if (!statusTarget || editLocked || statusSaving) return;
    setStatusSaving(true);
    try {
      if (isDirty) {
        const saved = await saveDraft({ confirmActiveProgramChange: false });
        if (!saved.ok) {
          if (!saved.cancelled) toast.error(notificationText.commonSaveFailed);
          return;
        }
      }
      const response = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/stages/${encodeURIComponent(statusTarget.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_progress' }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok) {
        toast.error(readSafeApiErrorText(payload, notificationText.commonGenericError));
        return;
      }
      setStatusTarget(null);
      await onRefresh();
      toast.success(notificationText.commonSaved);
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 md:hidden">
      <TreatmentProgramPipelineStagesDnd
        stageIds={pipelineStages.map((stage) => stage.id)}
        disabled={editLocked || draftSaving}
        onReorder={reorderStages}
      >
        <div className="flex min-w-0 flex-col gap-3">
          {pipelineStages.map((stage) => {
            const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups);
            const duration = mobileStageDurationLabel(stage, appDisplayTimeZone);
            return (
              <TreatmentProgramSortablePipelineStage
                key={stage.id}
                id={stage.id}
                disabled={editLocked || draftSaving}
                dragHandleClassName="size-8"
              >
                {(dragHandle) => (
                  <DoctorSection className="overflow-hidden p-0">
                    <div
                      className="border-b border-border/40 px-2 py-2"
                      style={{ background: INSTANCE_HEADER_BG_STAGE_EDITABLE }}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        {dragHandle}
                        <span className="min-w-0 flex-1 text-xs font-medium tabular-nums text-muted-foreground">
                          Этап {stage.sortOrder}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          className="size-8"
                          aria-label={`Добавить группу в этап ${stage.sortOrder}`}
                          disabled={editLocked}
                          onClick={() => setNewGroupStageId(stage.id)}
                        >
                          <Plus className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-8"
                          aria-label={`Редактировать этап ${stage.sortOrder}`}
                          disabled={editLocked}
                          onClick={() => setStageEditId(stage.id)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="size-8 text-foreground"
                          aria-label={`Информация об этапе ${stage.sortOrder}`}
                          onClick={() => setStageInfoId(stage.id)}
                        >
                          <Info className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(
                            'size-8 border',
                            stage.status === 'in_progress' || stage.status === 'available'
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border bg-background/60 text-foreground',
                          )}
                          aria-label={
                            stage.status === 'in_progress'
                              ? 'Открыть календарь выполнения'
                              : stage.status === 'locked'
                                ? 'Разблокировать и сделать этап активным'
                                : 'Сделать этап активным'
                          }
                          onClick={() => {
                            if (stage.status === 'in_progress') setCalendarStageId(stage.id);
                            else setStatusTarget(stage);
                          }}
                        >
                          {stage.status === 'locked' ? (
                            <LockKeyhole className="size-4 fill-current" />
                          ) : stage.status === 'in_progress' || stage.status === 'available' ? (
                            <Play className="size-4 fill-current" />
                          ) : (
                            <Square className="size-3.5 fill-current text-zinc-600" />
                          )}
                        </Button>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">
                        {stage.title}
                      </h3>
                      {duration ? (
                        <p className="mt-1 text-xs text-muted-foreground">{duration}</p>
                      ) : null}
                    </div>
                    <div className="p-2">
                      {sortedGroups.length === 0 ? (
                        <p className="px-1 py-2 text-sm text-muted-foreground">Нет групп.</p>
                      ) : (
                        <div className="divide-y divide-border/60">
                          {sortedGroups.map((stageGroup) => {
                            const groupItems = sortByOrderThenId(
                              stage.items.filter((item) => item.groupId === stageGroup.id),
                            );
                            return (
                              <button
                                key={stageGroup.id}
                                type="button"
                                className="block w-full px-1 py-2 text-left"
                                onClick={() =>
                                  setGroupTarget({ stageId: stage.id, groupId: stageGroup.id })
                                }
                              >
                                <span className="block text-sm font-medium leading-snug">
                                  {stageGroup.title}
                                </span>
                                {stageGroup.scheduleText?.trim() ? (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {stageGroup.scheduleText.trim()}
                                  </span>
                                ) : null}
                                {groupItems.length > 0 ? (
                                  <span className="mt-2 flex min-w-0 gap-1 overflow-x-auto">
                                    {groupItems.map((item) => (
                                      <DoctorCatalogMediaStaticThumb
                                        key={item.id}
                                        media={primaryMediaForStageItem(item)}
                                        frameClassName="size-10 rounded-md border border-border/60"
                                        sizes="40px"
                                      />
                                    ))}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </DoctorSection>
                )}
              </TreatmentProgramSortablePipelineStage>
            );
          })}
        </div>
      </TreatmentProgramPipelineStagesDnd>

      <Dialog
        open={group !== null}
        onOpenChange={(open) => {
          if (!open) setGroupTarget(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{group?.title ?? 'Группа'}</DialogTitle>
            {group?.scheduleText?.trim() ? (
              <DialogDescription>{group.scheduleText.trim()}</DialogDescription>
            ) : null}
          </DialogHeader>
          {groupStage && group ? (
            <InstanceStageGroupsPanel
              stage={groupStage}
              visibleGroupId={group.id}
              testResults={testResults}
              programStatus={detail.status}
              newGroupOpen={false}
              onNewGroupOpenChange={() => undefined}
              onRequestAddLibraryItem={onAddGroupItem}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={newGroupStageId !== null}
        onOpenChange={(open) => {
          if (!open) setNewGroupStageId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mobile-program-new-group">Название</Label>
            <Input
              id="mobile-program-new-group"
              value={newGroupTitle}
              onChange={(event) => setNewGroupTitle(event.target.value)}
              maxLength={2000}
            />
          </div>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewGroupStageId(null)}>
              Отмена
            </Button>
            <Button type="button" disabled={!newGroupTitle.trim()} onClick={createGroup}>
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingStage !== null} onOpenChange={(open) => !open && setStageEditId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактирование этапа</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mobile-stage-title">Название</Label>
              <Input
                id="mobile-stage-title"
                value={stageDraft.title}
                onChange={(event) =>
                  setStageDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile-stage-description">Описание</Label>
              <Textarea
                id="mobile-stage-description"
                rows={3}
                value={stageDraft.description}
                onChange={(event) =>
                  setStageDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <TiptapEditor
              name={`mobile_stage_goals_${editingStage?.id ?? 'none'}`}
              label="Цель этапа"
              helpText={null}
              value={stageDraft.goals}
              onChange={(goals) => setStageDraft((current) => ({ ...current, goals }))}
              minHeight={120}
            />
            <TiptapEditor
              name={`mobile_stage_objectives_${editingStage?.id ?? 'none'}`}
              label="Задачи этапа"
              helpText={null}
              value={stageDraft.objectives}
              onChange={(objectives) => setStageDraft((current) => ({ ...current, objectives }))}
              minHeight={120}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="mobile-stage-days">Длительность, дней</Label>
                <Input
                  id="mobile-stage-days"
                  inputMode="numeric"
                  value={stageDraft.days}
                  onChange={(event) =>
                    setStageDraft((current) => ({ ...current, days: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mobile-stage-duration">Срок текстом</Label>
                <Input
                  id="mobile-stage-duration"
                  value={stageDraft.durationText}
                  onChange={(event) =>
                    setStageDraft((current) => ({
                      ...current,
                      durationText: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStageEditId(null)}>
              Отмена
            </Button>
            <Button type="button" disabled={!stageDraft.title.trim()} onClick={saveStage}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={infoStage !== null} onOpenChange={(open) => !open && setStageInfoId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{infoStage?.title ?? 'Информация об этапе'}</DialogTitle>
          </DialogHeader>
          {infoStage ? (
            <div className="space-y-3 text-sm">
              {mobileStageDurationLabel(infoStage, appDisplayTimeZone) ? (
                <p className="text-muted-foreground">
                  {mobileStageDurationLabel(infoStage, appDisplayTimeZone)}
                </p>
              ) : null}
              {infoStage.description?.trim() ? (
                <p className="whitespace-pre-wrap">{infoStage.description.trim()}</p>
              ) : null}
              {infoStage.goals?.trim() ? (
                <div>
                  <p className="mb-1 font-medium">Цель</p>
                  {parseTiptapRichText(infoStage.goals) ? (
                    <RichTextDocumentTree document={parseTiptapRichText(infoStage.goals)!} />
                  ) : (
                    <p className="whitespace-pre-wrap">{infoStage.goals}</p>
                  )}
                </div>
              ) : null}
              {infoStage.objectives?.trim() ? (
                <div>
                  <p className="mb-1 font-medium">Задачи</p>
                  {parseTiptapRichText(infoStage.objectives) ? (
                    <RichTextDocumentTree document={parseTiptapRichText(infoStage.objectives)!} />
                  ) : (
                    <p className="whitespace-pre-wrap">{infoStage.objectives}</p>
                  )}
                </div>
              ) : null}
              {!infoStage.description?.trim() &&
              !infoStage.goals?.trim() &&
              !infoStage.objectives?.trim() ? (
                <p className="text-muted-foreground">Описание не заполнено.</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={statusTarget !== null} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.status === 'locked'
                ? 'Разблокировать и сделать этап активным?'
                : 'Сделать этап активным?'}
            </DialogTitle>
            <DialogDescription>Текущий активный этап будет завершён.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStatusTarget(null)}>
              Отмена
            </Button>
            <Button type="button" disabled={statusSaving} onClick={() => void activateStage()}>
              {statusSaving ? 'Сохранение…' : 'Сделать активным'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileStageCalendarDialog
        open={calendarStage !== null}
        onOpenChange={(open) => !open && setCalendarStageId(null)}
        patientUserId={detail.patientUserId}
        instanceId={detail.id}
        stage={calendarStage}
        timeZone={appDisplayTimeZone}
      />
    </div>
  );
}

export function TreatmentProgramInstanceDetailClient(props: {
  initial: TreatmentProgramInstanceDetail;
  /** «Фамилия Имя» пациента для второй строки шапки модалки упражнения. */
  patientName?: string | null;
  patientOnSupport?: boolean;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  /** attemptId → врач может принять эту попытку (актуальный хвост, ещё не принята). */
  initialAttemptAcceptMap: Record<string, boolean>;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  initialDiscussionUnreadCountByStageItemId: Record<string, number>;
  programCommentsEnabled?: boolean;
  initialOpenDiscussionItemId?: string | null;
  initialFocusTestResultId?: string | null;
}) {
  const [baseline, setBaseline] = useState(props.initial);

  const refreshBaseline = useCallback(async (): Promise<TreatmentProgramInstanceDetail> => {
    const res = await fetch(
      `/api/doctor/treatment-program-instances/${encodeURIComponent(baseline.id)}`,
    );
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      item?: TreatmentProgramInstanceDetail;
    };
    if (!res.ok || !data.ok || !data.item) {
      throw new Error('Не удалось обновить данные');
    }
    setBaseline(data.item);
    return data.item;
  }, [baseline.id]);

  return (
    <InstanceEditorDraftProvider
      baseline={baseline}
      programStatus={baseline.status}
      onBaselineSynced={refreshBaseline}
    >
      <TreatmentProgramInstanceDetailClientBody
        {...props}
        baseline={baseline}
        refreshBaseline={refreshBaseline}
      />
    </InstanceEditorDraftProvider>
  );
}

function TreatmentProgramInstanceDetailClientBody(props: {
  initial: TreatmentProgramInstanceDetail;
  patientName?: string | null;
  patientOnSupport?: boolean;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  initialAttemptAcceptMap: Record<string, boolean>;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  initialDiscussionUnreadCountByStageItemId: Record<string, number>;
  programCommentsEnabled?: boolean;
  initialOpenDiscussionItemId?: string | null;
  initialFocusTestResultId?: string | null;
  baseline: TreatmentProgramInstanceDetail;
  refreshBaseline: () => Promise<TreatmentProgramInstanceDetail>;
}) {
  const {
    patientName,
    patientOnSupport = false,
    initialOpenDiscussionItemId,
    initialFocusTestResultId,
    initialTestResults,
    initialAttemptAcceptMap,
    appDisplayTimeZone,
    treatmentProgramLibrary,
    initialDiscussionUnreadCountByStageItemId,
    programCommentsEnabled = true,
    baseline,
    refreshBaseline,
  } = props;
  const { displayDetail, setItemReorder } = useInstanceEditorDraft();
  const detail = displayDetail;
  const [testResults, setTestResults] =
    useState<TreatmentProgramTestResultDetailRow[]>(initialTestResults);
  const [attemptAcceptMap, setAttemptAcceptMap] =
    useState<Record<string, boolean>>(initialAttemptAcceptMap);
  const [addLibrarySpec, setAddLibrarySpec] = useState<InstanceAddLibraryItemSpec | null>(null);
  const [discussionUnreadCountByStageItemId, setDiscussionUnreadCountByStageItemId] = useState(
    initialDiscussionUnreadCountByStageItemId,
  );
  const discussionUnreadCount = useMemo(
    () =>
      Object.values(discussionUnreadCountByStageItemId).reduce(
        (total, unread) => total + unread,
        0,
      ),
    [discussionUnreadCountByStageItemId],
  );
  const handleDiscussionRead = useCallback((stageItemIds: string[]) => {
    setDiscussionUnreadCountByStageItemId((current) => {
      const next = { ...current };
      let changed = false;
      for (const stageItemId of stageItemIds) {
        if ((next[stageItemId] ?? 0) === 0) continue;
        next[stageItemId] = 0;
        changed = true;
      }
      return changed ? next : current;
    });
  }, []);
  const itemTitles = useMemo(() => itemTitleById(detail), [detail]);
  const [discussionTarget, setDiscussionTarget] = useState<{
    itemId: string;
    label: string;
  } | null>(() => {
    const itemId = initialOpenDiscussionItemId?.trim();
    return itemId ? { itemId, label: itemTitles.get(itemId) ?? 'Элемент' } : null;
  });
  const [instanceDiscussionOpen, setInstanceDiscussionOpen] = useState(false);
  const [addStageDialogOpen, setAddStageDialogOpen] = useState(false);
  const [stageOrderDialogOpen, setStageOrderDialogOpen] = useState(false);

  const sortedStages = useMemo(
    () => [...detail.stages].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [detail.stages],
  );
  const pipelineStages = useMemo(() => sortedStages.filter((s) => s.sortOrder > 0), [sortedStages]);
  const currentStage = useMemo(
    () =>
      pipelineStages.find((stage) => stage.status === 'in_progress') ??
      pipelineStages.find((stage) => stage.status === 'available') ??
      pipelineStages[0] ??
      null,
    [pipelineStages],
  );
  const { isStageExpanded, setStageExpanded } = useInstanceEditorPipelineStageExpansion(
    pipelineStages.map((stage) => ({
      id: stage.id,
      sortOrder: stage.sortOrder,
      status: stage.status,
    })),
  );
  const stageZero = useMemo(
    () => sortedStages.find((s) => s.sortOrder === 0) ?? null,
    [sortedStages],
  );
  const phaseZeroRecommendations = useMemo(
    () =>
      stageZero
        ? sortByOrderThenId(stageZero.items.filter((it) => it.itemType === 'recommendation'))
        : [],
    [stageZero],
  );

  const refresh = useCallback(async () => {
    try {
      await refreshBaseline();
    } catch {
      toast.error(notificationText.doctorDataUpdateFailed);
    }
  }, [refreshBaseline]);

  const refreshResults = useCallback(async () => {
    const res = await fetch(
      `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-results`,
    );
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      results?: TreatmentProgramTestResultDetailRow[];
      attemptAcceptMap?: Record<string, boolean>;
    };
    if (res.ok && data.ok && data.results) {
      setTestResults(data.results);
      if (data.attemptAcceptMap !== undefined) setAttemptAcceptMap(data.attemptAcceptMap);
    }
  }, [detail.id]);

  const reorderPhaseZeroItem = useCallback(
    (itemId: string, dir: -1 | 1) => {
      if (!stageZero) return;
      const ordered = computeOrderedItemIdsAfterGroupItemAdjacentSwap(
        stageZero.items,
        null,
        itemId,
        dir,
        {
          itemInReorderBand: (it) => it.itemType === 'recommendation',
        },
      );
      if (!ordered) return;
      setItemReorder(stageZero.id, ordered);
    },
    [stageZero, setItemReorder],
  );

  useEffect(() => {
    const resultId = initialFocusTestResultId?.trim();
    if (!resultId) return;

    let cancelled = false;
    let highlightTimer: number | undefined;
    let retryTimer: number | undefined;
    let attempts = 0;
    const maxAttempts = 20;

    const applyHighlight = (el: HTMLElement) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg');
      highlightTimer = window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg');
      }, 4000);
    };

    const tryFocus = () => {
      if (cancelled) return;
      const el = document.getElementById(doctorProgramTestResultDomId(resultId));
      if (!el) {
        attempts += 1;
        if (attempts < maxAttempts) {
          retryTimer = window.setTimeout(tryFocus, 100);
        }
        return;
      }
      applyHighlight(el);
    };

    tryFocus();
    return () => {
      cancelled = true;
      if (highlightTimer !== undefined) window.clearTimeout(highlightTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [initialFocusTestResultId]);

  return (
    <div className="flex flex-col gap-4">
      <MobileInstanceDraftAutosaveBridge />
      <DoctorSection id="doctor-program-instance-summary">
        <div>
          <DoctorSectionTitle>
            {detail.status === 'completed' ? 'Завершённая программа' : 'Назначенная программа'}
          </DoctorSectionTitle>
          <p className="mt-1 text-base font-normal text-foreground">{detail.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatProgramAssignmentMeta(detail.createdAt, appDisplayTimeZone)}
          </p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 md:grid-cols-2">
          {programCommentsEnabled ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative h-9 min-w-0"
              onClick={() => setInstanceDiscussionOpen(true)}
              data-testid="instance-editor-comments"
            >
              <MessageSquare className="size-3.5" aria-hidden />
              Комментарии
              {discussionUnreadCount > 0 ? (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5">
                  {discussionUnreadCount}
                </Badge>
              ) : null}
            </Button>
          ) : null}
          <ProgramInstanceCompleteControl
            instanceId={detail.id}
            status={detail.status}
            onPatched={refresh}
          />
          <Button
            type="button"
            size="icon"
            className="size-9 md:hidden"
            aria-label="Добавить этап"
            disabled={isProgramInstanceEditLocked(detail.status)}
            onClick={() => setAddStageDialogOpen(true)}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
      </DoctorSection>
      <div className="hidden md:block">
        <InstanceEditorToolbar
          stageNumber={currentStage?.sortOrder ?? null}
          stageTitle={currentStage?.title ?? 'Этапы не добавлены'}
          programStatus={detail.status}
          pipelineStageCount={pipelineStages.length}
          onAddStageClick={() => setAddStageDialogOpen(true)}
          onChangeStageOrderClick={() => setStageOrderDialogOpen(true)}
        />
      </div>
      <InstanceEditorAddStageDialog
        open={addStageDialogOpen}
        onOpenChange={setAddStageDialogOpen}
        programStatus={detail.status}
      />
      <InstanceEditorStageOrderDialog
        open={stageOrderDialogOpen}
        onOpenChange={setStageOrderDialogOpen}
        programStatus={detail.status}
        stageZeroId={stageZero?.id ?? null}
        pipelineStages={pipelineStages.map((s) => ({ id: s.id, title: s.title }))}
      />
      {programCommentsEnabled ? (
        <DoctorLfkCommentsModal
          open={instanceDiscussionOpen}
          onClose={() => setInstanceDiscussionOpen(false)}
          patientUserId={detail.patientUserId}
          patientName={patientName ?? ''}
          patientOnSupport={patientOnSupport}
          stageTitle={currentStage?.title ?? null}
          onUnreadCleared={({ stageItemId }) => handleDiscussionRead([stageItemId])}
        />
      ) : null}
      {stageZero ? (
        <MobileRecommendationEditor
          instanceId={detail.id}
          stage={stageZero}
          items={phaseZeroRecommendations}
          testResults={testResults}
          programStatus={detail.status}
          onAdd={() =>
            setAddLibrarySpec({
              stageId: stageZero.id,
              context: 'phase_zero_recommendations',
              customGroupId: null,
            })
          }
        />
      ) : (
        <DoctorSection className="overflow-hidden p-0 md:hidden">
          <div
            className="border-b border-border/25 px-2 py-2"
            style={{ background: TPL_HEADER_BG_RECOMMENDATIONS }}
          >
            <h3 className="text-sm font-semibold">Общие рекомендации</h3>
          </div>
          <p className="p-3 text-sm text-muted-foreground">Нет рекомендаций.</p>
        </DoctorSection>
      )}
      <DoctorSection
        className="hidden overflow-hidden p-0 md:block"
        id="doctor-program-instance-phase0-recommendations"
      >
        <div
          className="flex items-center justify-between gap-2 border-b border-border/25 px-2 py-2"
          style={{ background: TPL_HEADER_BG_RECOMMENDATIONS }}
        >
          <h3 className="text-sm font-semibold leading-tight text-foreground">
            Общие рекомендации (этап 0)
          </h3>
          {stageZero ? (
            <TreatmentProgramAddItemSquareButton
              disabled={isProgramInstanceEditLocked(detail.status)}
              onClick={() =>
                setAddLibrarySpec({
                  stageId: stageZero.id,
                  context: 'phase_zero_recommendations',
                  customGroupId: null,
                })
              }
            />
          ) : null}
        </div>
        <div className="p-3">
          {!stageZero ? (
            <p className="text-sm text-muted-foreground">В программе нет этапа с номером 0.</p>
          ) : phaseZeroRecommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет рекомендаций на этапе 0.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {phaseZeroRecommendations.map((item, idx) => (
                <DoctorProgramInstanceItemCard
                  key={item.id}
                  stage={stageZero}
                  item={item}
                  testResults={testResults}
                  programStatus={detail.status}
                  phaseZeroRecommendation
                  reorderInGroup={{
                    disableAll: isProgramInstanceEditLocked(detail.status),
                    disableUp: idx <= 0,
                    disableDown: idx >= phaseZeroRecommendations.length - 1,
                    onMove: (dir) => void reorderPhaseZeroItem(item.id, dir),
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </DoctorSection>

      <MobileProgramStagesEditor
        detail={detail}
        pipelineStages={pipelineStages}
        stageZeroId={stageZero?.id ?? null}
        testResults={testResults}
        appDisplayTimeZone={appDisplayTimeZone}
        onAddGroupItem={(spec) => setAddLibrarySpec(spec)}
        onRefresh={refresh}
      />

      {testResults.length > 0 ? (
        <DoctorSection className="hidden md:block" id="doctor-program-instance-test-results">
          <h3 className={doctorClientSectionTitleClass}>Результаты тестов</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {groupTestResultsByAttempt(testResults).map((g) => {
              const pending = g.results.filter((x) => !x.decidedBy).length;
              return (
                <li
                  key={g.attemptId}
                  className="rounded-lg border border-border/70 bg-muted/15 p-2"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                    <p className="text-xs text-muted-foreground">
                      {g.submittedAt
                        ? `Отправлено: ${g.submittedAt.slice(0, 19).replace('T', ' ')}`
                        : `Начато: ${g.startedAt.slice(0, 19).replace('T', ' ')}`}
                      {g.acceptedAt
                        ? ` · принято: ${g.acceptedAt.slice(0, 19).replace('T', ' ')}`
                        : ''}
                      {pending > 0 ? ` · без оценки: ${pending}` : ''}
                    </p>
                    {g.submittedAt &&
                    !g.acceptedAt &&
                    detail.status !== 'completed' &&
                    attemptAcceptMap[g.attemptId] ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await runIfProgramInstanceMutationAllowed(detail.status, async () => {
                            const res = await fetch(
                              `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-attempts/${encodeURIComponent(g.attemptId)}/accept`,
                              { method: 'POST' },
                            );
                            if (res.ok) {
                              void refreshResults();
                              void refresh();
                            }
                          });
                        }}
                      >
                        Принять попытку
                      </Button>
                    ) : null}
                  </div>
                  <ul className="m-0 list-none space-y-2 p-0">
                    {g.results.map((r) => (
                      <li
                        key={r.id}
                        id={doctorProgramTestResultDomId(r.id)}
                        className="rounded border border-border/50 bg-background/50 p-2"
                      >
                        <p className="font-medium">
                          {r.testTitle ?? r.testId}{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({r.stageTitle}) ·{' '}
                            {formatNormalizedTestDecisionRu(r.normalizedDecision)} (
                            {r.normalizedDecision})
                          </span>
                          {r.decidedBy ? (
                            <span className="ml-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
                              переопределено врачом
                            </span>
                          ) : null}
                        </p>
                        <pre className="mt-1 max-h-24 overflow-auto text-[11px] text-muted-foreground">
                          {JSON.stringify(r.rawValue, null, 0)}
                        </pre>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(['passed', 'failed', 'partial'] as const).map((d) => (
                            <Button
                              key={d}
                              type="button"
                              size="sm"
                              variant={r.normalizedDecision === d ? 'default' : 'outline'}
                              disabled={detail.status === 'completed'}
                              onClick={async () => {
                                await runIfProgramInstanceMutationAllowed(
                                  detail.status,
                                  async () => {
                                    const res = await fetch(
                                      `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-results/${encodeURIComponent(r.id)}`,
                                      {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ normalizedDecision: d }),
                                      },
                                    );
                                    if (res.ok) void refreshResults();
                                  },
                                );
                              }}
                            >
                              {d}
                            </Button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </DoctorSection>
      ) : null}

      <div id="doctor-program-instance-pipeline" className="hidden min-w-0 flex-col gap-4 md:flex">
        {pipelineStages.map((stage) => (
          <DoctorInstancePipelineStageBlock
            key={`${stage.id}:${stage.sortOrder}`}
            instanceId={detail.id}
            stage={stage}
            programStatus={detail.status}
            testResults={testResults}
            onSaved={refresh}
            onRequestAddLibraryItem={(spec) => setAddLibrarySpec(spec)}
            expanded={isStageExpanded(stage.id)}
            onExpandedChange={(open) => setStageExpanded(stage.id, open)}
          />
        ))}
      </div>
      <InstanceAddLibraryItemDialog
        open={addLibrarySpec !== null}
        onOpenChange={(o) => {
          if (!o) setAddLibrarySpec(null);
        }}
        spec={addLibrarySpec}
        library={treatmentProgramLibrary}
        editLocked={isProgramInstanceEditLocked(detail.status)}
      />
      {programCommentsEnabled && discussionTarget ? (
        <DoctorProgramItemDiscussionDialog
          instanceId={detail.id}
          itemId={discussionTarget.itemId}
          itemLabel={discussionTarget.label}
          patientName={patientName}
          patientUserId={detail.patientUserId}
          patientOnSupport={patientOnSupport}
          patientVariant="context"
          open
          onOpenChange={(open) => {
            if (!open) setDiscussionTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

function InstanceStageGroupsPanel(props: {
  stage: TreatmentProgramInstanceDetail['stages'][number];
  /** Мобильная модалка одной группы сохраняет полное дерево для корректного общего reorder. */
  visibleGroupId?: string;
  testResults: TreatmentProgramTestResultDetailRow[];
  programStatus: TreatmentProgramInstanceStatus;
  newGroupOpen: boolean;
  onNewGroupOpenChange: (open: boolean) => void;
  onRequestAddLibraryItem: (spec: InstanceAddLibraryItemSpec) => void;
}) {
  const {
    stage,
    visibleGroupId,
    testResults,
    programStatus,
    newGroupOpen,
    onNewGroupOpenChange,
    onRequestAddLibraryItem,
  } = props;
  const {
    patchGroup,
    setGroupReorder,
    setItemReorder,
    patchItemStructural,
    hideGroup,
    addGroupCreate,
  } = useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const [title, setTitle] = useState('');
  const [groupEdit, setGroupEdit] = useState<{
    id: string;
    title: string;
    description: string;
    scheduleText: string;
  } | null>(null);
  const displayStage = stage;
  const allSortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups);
  const sortedGroups = visibleGroupId
    ? allSortedGroups.filter((group) => group.id === visibleGroupId)
    : allSortedGroups;
  const userGroupsOrdered = allSortedGroups.filter((g) => !g.systemKind);
  const ungrouped = sortByOrderThenId(displayStage.items.filter((it) => !it.groupId));
  const hasUngrouped = visibleGroupId === undefined && ungrouped.length > 0;
  const hasGroups = sortedGroups.length > 0;
  const isEmptyStage = !hasUngrouped && !hasGroups && displayStage.items.length === 0;

  const editingGroupMeta = groupEdit ? stage.groups.find((g) => g.id === groupEdit.id) : null;
  const editingIsSystem = editingGroupMeta
    ? isTreatmentProgramInstanceSystemStageGroup(editingGroupMeta)
    : false;

  const reorder = (groupId: string, dir: -1 | 1) => {
    if (editLocked) return;
    const idx = userGroupsOrdered.findIndex((g) => g.id === groupId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= userGroupsOrdered.length) return;
    const newOrder = userGroupsOrdered.map((g) => g.id);
    const a = newOrder[idx]!;
    const b = newOrder[j]!;
    newOrder[idx] = b;
    newOrder[j] = a;
    setGroupReorder(stage.id, newOrder);
  };

  const reorderItemInStageGroup = (groupId: string | null, itemId: string, dir: -1 | 1) => {
    if (editLocked) return;
    const ordered = computeOrderedItemIdsAfterGroupItemAdjacentSwap(
      stage.items,
      groupId,
      itemId,
      dir,
    );
    if (!ordered) return;
    setItemReorder(stage.id, ordered);
  };

  const handleItemDnd = (activeId: string, overId: string) => {
    if (editLocked) return;
    const canParticipate = (it: InstanceStageItemT) => isInstanceItemDndEligible(displayStage, it);
    const plan = planStageItemDndReorder(displayStage.items, activeId, overId, canParticipate);
    if (!plan.ok) {
      if (plan.error === 'ungrouped_type') {
        toast.error(notificationText.treatmentProgramNoGroupRestrictedElements);
      } else {
        toast.error(notificationText.doctorOrderUpdateFailed);
      }
      return;
    }
    if (plan.needsGroupPatch) {
      patchItemStructural(activeId, { groupId: plan.nextGroupId });
    }
    setItemReorder(stage.id, plan.orderedItemIds);
  };

  const dndItemIds = instanceStageDndItemIds(displayStage).filter((itemId) => {
    if (visibleGroupId === undefined) return true;
    return displayStage.items.some((item) => item.id === itemId && item.groupId === visibleGroupId);
  });

  const hideGroupFromModal = () => {
    if (!groupEdit) return;
    if (editLocked) return;
    const merged =
      programStatus === 'active'
        ? 'Применить к активной программе? Элементы группы будут скрыты, группа удалена. Продолжить?'
        : 'Элементы группы будут скрыты, сама группа удалена. Продолжить?';
    if (!globalThis.confirm(merged)) return;
    hideGroup(groupEdit.id);
    setGroupEdit(null);
  };

  const addGroup = () => {
    if (editLocked) return;
    const t = title.trim();
    if (!t) return;
    addGroupCreate({ stageId: stage.id, title: t });
    setTitle('');
    onNewGroupOpenChange(false);
  };

  const saveGroupEdit = () => {
    if (!groupEdit) return;
    if (editLocked) return;
    const gMeta = stage.groups.find((g) => g.id === groupEdit.id);
    const isSysGroup = gMeta ? isTreatmentProgramInstanceSystemStageGroup(gMeta) : false;
    if (!isSysGroup) {
      const t = groupEdit.title.trim();
      if (!t) {
        toast.error(notificationText.treatmentProgramGroupNameEmpty);
        return;
      }
    }
    patchGroup(
      groupEdit.id,
      isSysGroup
        ? {
            description: groupEdit.description.trim() || null,
            scheduleText: groupEdit.scheduleText.trim() || null,
          }
        : {
            title: groupEdit.title.trim(),
            description: groupEdit.description.trim() || null,
            scheduleText: groupEdit.scheduleText.trim() || null,
          },
    );
    setGroupEdit(null);
  };

  const shouldRenderDropPreviewBeforeItem = (
    placement: InstanceStageItemDropPreviewPlacement | null,
    groupId: string | null,
    items: InstanceStageItemT[],
    index: number,
  ): boolean => {
    if (!placement || placement.groupId !== groupId) return false;
    const nonActiveBefore = items
      .slice(0, index)
      .filter((item) => item.id !== placement.activeId).length;
    return placement.insertIndex === nonActiveBefore;
  };

  const shouldRenderDropPreviewAfterItems = (
    placement: InstanceStageItemDropPreviewPlacement | null,
    groupId: string | null,
    items: InstanceStageItemT[],
  ): boolean => {
    if (!placement || placement.groupId !== groupId) return false;
    const nonActiveCount = items.filter((item) => item.id !== placement.activeId).length;
    return placement.insertIndex >= nonActiveCount;
  };

  return (
    <div className="min-w-0">
      {isEmptyStage ? (
        <p className="text-sm text-muted-foreground">В этапе пока нет элементов и групп.</p>
      ) : (
        <TreatmentProgramStageItemsDnd
          sortableItemIds={dndItemIds}
          disabled={editLocked}
          onReorder={handleItemDnd}
        >
          {(dropPreview) => {
            const dropPreviewPlacement = buildInstanceStageItemDropPreviewPlacement(
              displayStage,
              dropPreview,
            );
            return (
              <div className="mt-1 space-y-3">
                {sortedGroups.map((g) => {
                  const gItems = sortByOrderThenId(
                    displayStage.items.filter((it) => it.groupId === g.id),
                  );
                  const isSys = isTreatmentProgramInstanceSystemStageGroup(g);
                  const userIdx = userGroupsOrdered.findIndex((x) => x.id === g.id);
                  return (
                    <div
                      key={g.id}
                      className="overflow-visible rounded-md border border-border/50 bg-background/60 shadow-sm"
                    >
                      <div
                        className="flex items-start justify-between gap-2 border-b border-border/25 px-2 py-1.5"
                        style={instanceGroupHeaderSurfaceStyle(g)}
                      >
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-sm font-semibold leading-snug text-foreground">
                            {g.title}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            Элементов: {gItems.length}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
                          <TreatmentProgramAddItemSquareButton
                            disabled={editLocked}
                            onClick={() => {
                              if (isSys) {
                                if (g.systemKind === 'recommendations') {
                                  onRequestAddLibraryItem({
                                    stageId: stage.id,
                                    context: 'stage_system_recommendations',
                                    customGroupId: null,
                                  });
                                } else {
                                  onRequestAddLibraryItem({
                                    stageId: stage.id,
                                    context: 'stage_system_tests',
                                    customGroupId: null,
                                  });
                                }
                              } else {
                                onRequestAddLibraryItem({
                                  stageId: stage.id,
                                  context: 'custom_group',
                                  customGroupId: g.id,
                                });
                              }
                            }}
                          />
                          {!isSys ? (
                            <>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="outline"
                                aria-label={`Поднять группу ${g.title}`}
                                disabled={editLocked || userIdx <= 0}
                                onClick={() => reorder(g.id, -1)}
                              >
                                <ChevronUp aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="outline"
                                aria-label={`Опустить группу ${g.title}`}
                                disabled={
                                  editLocked ||
                                  userIdx < 0 ||
                                  userIdx >= userGroupsOrdered.length - 1
                                }
                                onClick={() => reorder(g.id, 1)}
                              >
                                <ChevronDown aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={tplToolbarTextBtnClass}
                                disabled={editLocked}
                                onClick={() =>
                                  setGroupEdit({
                                    id: g.id,
                                    title: g.title,
                                    description: g.description ?? '',
                                    scheduleText: g.scheduleText ?? '',
                                  })
                                }
                              >
                                Изменить
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={tplToolbarTextBtnClass}
                              disabled={editLocked}
                              onClick={() =>
                                setGroupEdit({
                                  id: g.id,
                                  title: g.title,
                                  description: g.description ?? '',
                                  scheduleText: g.scheduleText ?? '',
                                })
                              }
                            >
                              Изменить
                            </Button>
                          )}
                        </div>
                      </div>
                      {g.scheduleText?.trim() ? (
                        <div className="border-b border-border/15 px-2 py-1">
                          <p className="text-xs text-muted-foreground">{g.scheduleText.trim()}</p>
                        </div>
                      ) : null}
                      <div className="p-2">
                        {gItems.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">
                            В группе пока нет элементов.
                          </p>
                        ) : (
                          <ul className="space-y-px">
                            {gItems.map((item, idx) => {
                              const dndEligible = isInstanceItemDndEligible(displayStage, item);
                              const dropPreviewBefore = shouldRenderDropPreviewBeforeItem(
                                dropPreviewPlacement,
                                g.id,
                                gItems,
                                idx,
                              );
                              const card = (
                                <DoctorProgramInstanceItemCard
                                  stage={stage}
                                  item={item}
                                  testResults={testResults}
                                  programStatus={programStatus}
                                  reorderInGroup={{
                                    disableAll: editLocked,
                                    disableUp: idx <= 0,
                                    disableDown: idx >= gItems.length - 1,
                                    onMove: (dir) =>
                                      void reorderItemInStageGroup(g.id, item.id, dir),
                                  }}
                                />
                              );
                              if (!dndEligible) {
                                return (
                                  <Fragment key={item.id}>
                                    {dropPreviewBefore ? (
                                      <InstanceStageItemDropPreviewMarker />
                                    ) : null}
                                    <li className="list-none px-1 py-1.5">{card}</li>
                                  </Fragment>
                                );
                              }
                              return (
                                <Fragment key={item.id}>
                                  {dropPreviewBefore ? (
                                    <InstanceStageItemDropPreviewMarker />
                                  ) : null}
                                  <TreatmentProgramSortableItemShell
                                    id={item.id}
                                    disabled={editLocked}
                                    className="list-none px-1 py-1.5"
                                  >
                                    {(dragHandle) => (
                                      <DoctorProgramInstanceItemCard
                                        stage={stage}
                                        item={item}
                                        testResults={testResults}
                                        programStatus={programStatus}
                                        dragHandle={dragHandle}
                                        reorderInGroup={{
                                          disableAll: editLocked,
                                          disableUp: idx <= 0,
                                          disableDown: idx >= gItems.length - 1,
                                          onMove: (dir) =>
                                            void reorderItemInStageGroup(g.id, item.id, dir),
                                        }}
                                      />
                                    )}
                                  </TreatmentProgramSortableItemShell>
                                </Fragment>
                              );
                            })}
                            {shouldRenderDropPreviewAfterItems(
                              dropPreviewPlacement,
                              g.id,
                              gItems,
                            ) ? (
                              <InstanceStageItemDropPreviewMarker />
                            ) : null}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
                {hasUngrouped ? (
                  <div className="overflow-visible rounded-md border-2 border-destructive bg-background/60">
                    <div className="border-b border-destructive/50 bg-destructive/20 px-2 py-2 dark:bg-destructive/30">
                      <p className="text-sm font-semibold text-foreground">Без группы</p>
                    </div>
                    <div className="p-2">
                      <ul className="space-y-px">
                        {ungrouped.map((item, idx) => {
                          const dropPreviewBefore = shouldRenderDropPreviewBeforeItem(
                            dropPreviewPlacement,
                            null,
                            ungrouped,
                            idx,
                          );
                          return (
                            <Fragment key={item.id}>
                              {dropPreviewBefore ? <InstanceStageItemDropPreviewMarker /> : null}
                              <TreatmentProgramSortableItemShell
                                id={item.id}
                                disabled={editLocked}
                                className="list-none px-1 py-1.5"
                              >
                                {(dragHandle) => (
                                  <DoctorProgramInstanceItemCard
                                    stage={stage}
                                    item={item}
                                    testResults={testResults}
                                    programStatus={programStatus}
                                    dragHandle={dragHandle}
                                    reorderInGroup={{
                                      disableAll: editLocked,
                                      disableUp: idx <= 0,
                                      disableDown: idx >= ungrouped.length - 1,
                                      onMove: (dir) =>
                                        void reorderItemInStageGroup(null, item.id, dir),
                                    }}
                                  />
                                )}
                              </TreatmentProgramSortableItemShell>
                            </Fragment>
                          );
                        })}
                        {shouldRenderDropPreviewAfterItems(
                          dropPreviewPlacement,
                          null,
                          ungrouped,
                        ) ? (
                          <InstanceStageItemDropPreviewMarker />
                        ) : null}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }}
        </TreatmentProgramStageItemsDnd>
      )}
      <Dialog open={newGroupOpen} modal={false} onOpenChange={onNewGroupOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
            <DialogDescription>Группа для объединения пунктов внутри этапа.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`ng-${stage.id}`}>Название</Label>
            <Input
              id={`ng-${stage.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={2000}
            />
          </div>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onNewGroupOpenChange(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={editLocked || !title.trim()}
              onClick={() => void addGroup()}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {groupEdit ? (
        <Dialog
          key={groupEdit.id}
          open={true}
          modal={false}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setGroupEdit(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Группа этапа</DialogTitle>
              <DialogDescription>
                {editingIsSystem
                  ? 'Поля описания и расписания; название системной группы фиксировано.'
                  : 'Название, описание и расписание группы.'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`eg-title-${groupEdit.id}`}>Название</Label>
                <Input
                  id={`eg-title-${groupEdit.id}`}
                  value={groupEdit.title}
                  onChange={(e) =>
                    setGroupEdit((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                  }
                  maxLength={2000}
                  disabled={editingIsSystem}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`eg-desc-${groupEdit.id}`}>Описание</Label>
                <Textarea
                  id={`eg-desc-${groupEdit.id}`}
                  rows={3}
                  className="text-sm"
                  value={groupEdit.description}
                  onChange={(e) =>
                    setGroupEdit((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                  }
                  maxLength={10000}
                  disabled={false}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`eg-sch-${groupEdit.id}`}>Расписание (текст)</Label>
                <Textarea
                  id={`eg-sch-${groupEdit.id}`}
                  rows={2}
                  className="text-sm"
                  value={groupEdit.scheduleText}
                  onChange={(e) =>
                    setGroupEdit((prev) =>
                      prev ? { ...prev, scheduleText: e.target.value } : prev,
                    )
                  }
                  maxLength={5000}
                  disabled={false}
                />
              </div>
            </div>
            <DialogFooter className="flex-row flex-nowrap justify-between gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setGroupEdit(null)}>
                Отмена
              </Button>
              {editingIsSystem ? null : (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={editLocked}
                  onClick={() => void hideGroupFromModal()}
                >
                  Скрыть
                </Button>
              )}
              <Button
                type="button"
                disabled={editLocked || (!editingIsSystem && !groupEdit.title.trim())}
                onClick={() => void saveGroupEdit()}
              >
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function InstanceStageItemDoctorRow(props: {
  item: TreatmentProgramInstanceDetail['stages'][number]['items'][number];
  groups: TreatmentProgramInstanceDetail['stages'][number]['groups'];
  testResults: TreatmentProgramTestResultDetailRow[];
  editLocked: boolean;
  /** Скрыть выбор группы (блок рекомендаций этапа 0). */
  hideGroupSelect?: boolean;
}) {
  const { item, groups, testResults, editLocked, hideGroupSelect = false } = props;
  const { patchItemStructural, deleteItem: deleteItemDraft } = useInstanceEditorDraft();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const hasHistory =
    Boolean(item.completedAt) || testResults.some((r) => r.instanceStageItemId === item.id);

  const groupSelectItems = useMemo(() => {
    const sorted = sortByOrderThenId(groups);
    const m: Record<string, ReactNode> = {
      [treatmentProgramGroupSelectNoneItemValue]: treatmentProgramGroupSelectNoneLabel,
    };
    for (const g of sorted) {
      m[g.id] = g.title;
    }
    return m;
  }, [groups]);

  const itemGroup = useMemo(
    () => (item.groupId ? groups.find((g) => g.id === item.groupId) : undefined),
    [groups, item.groupId],
  );

  /** Системные группы этапа — группа зафиксирована, перенос через выпадающий список не показываем. */
  const showGroupSelect =
    !hideGroupSelect &&
    !(itemGroup !== undefined && isTreatmentProgramInstanceSystemStageGroup(itemGroup));

  const applyStructural = (patch: InstanceEditorItemStructuralPatch) => {
    if (editLocked) return;
    patchItemStructural(item.id, patch);
  };

  const deleteItem = () => {
    if (editLocked) return;
    deleteItemDraft(item.id);
    setDeleteConfirmOpen(false);
  };

  const recActionabilityValue = item.isActionable === false ? 'persistent' : 'actionable';
  const groupSelectValue = item.groupId ?? treatmentProgramGroupSelectNoneItemValue;

  return (
    <div className={cn('flex flex-col gap-3', item.status === 'disabled' && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.status === 'disabled' ? 'secondary' : 'default'}>
          {item.status === 'disabled' ? 'Отключено' : 'Активно'}
        </Badge>
        {item.itemType === 'recommendation' ? (
          <Select
            value={recActionabilityValue}
            onValueChange={(v) => applyStructural({ isActionable: v === 'actionable' })}
            disabled={editLocked}
            items={doctorRecommendationActionabilitySelectItems}
          >
            <SelectTrigger className="h-8 w-full min-w-0 max-w-xs text-xs sm:w-[220px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="actionable">Требует выполнения</SelectItem>
              <SelectItem value="persistent">Постоянная рекомендация</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {showGroupSelect ? (
        <div className="w-full max-w-md">
          <Select
            value={groupSelectValue}
            onValueChange={(v) => applyStructural({ groupId: v === '__none__' ? null : v })}
            disabled={editLocked}
            items={groupSelectItems}
          >
            <SelectTrigger className="h-8 w-full text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Без группы</SelectItem>
              {sortByOrderThenId(groups).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {item.status === 'active' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={editLocked}
            onClick={() => {
              if (hasHistory) setConfirmOpen(true);
              else applyStructural({ status: 'disabled' });
            }}
          >
            Отключить
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={editLocked}
            onClick={() => applyStructural({ status: 'active' })}
          >
            Включить
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={editLocked}
          onClick={() => setDeleteConfirmOpen(true)}
        >
          Удалить
        </Button>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отключить элемент?</DialogTitle>
            <DialogDescription>
              У элемента уже есть выполнение или результат теста. Он будет скрыт, история
              сохранится.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                applyStructural({ status: 'disabled' });
              }}
            >
              Отключить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить элемент?</DialogTitle>
            <DialogDescription>
              Строка будет удалена из программы без возможности восстановления. Если у элемента есть
              выполнение или попытка теста, удаление будет отклонено.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" disabled={editLocked} onClick={deleteItem}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StageDoctorControls(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail['stages'][number];
  programStatus: TreatmentProgramInstanceStatus;
  onPatched: () => Promise<void>;
}) {
  const { instanceId, stage, programStatus, onPatched } = props;
  const { patchStageMetadata } = useInstanceEditorDraft();
  const { runOrPromptSave, unsavedDialog } = useInstanceEditorUnsavedGate();
  const stageId = stage.id;
  const status = stage.status;
  const editLocked = isProgramInstanceEditLocked(programStatus);

  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipReasonDraft, setSkipReasonDraft] = useState('');
  /** Валидация полей диалога пропуска; результаты действий — во всплывающем уведомлении. */
  const [skipDialogError, setSkipDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [stageSettingsOpen, setStageSettingsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stage.title);
  const [descriptionDraft, setDescriptionDraft] = useState(stage.description ?? '');
  const [goalsDraft, setGoalsDraft] = useState(stage.goals ?? '');
  const [objectivesDraft, setObjectivesDraft] = useState(stage.objectives ?? '');
  const [daysDraft, setDaysDraft] = useState(
    stage.expectedDurationDays != null ? String(stage.expectedDurationDays) : '',
  );
  const [textDraft, setTextDraft] = useState(stage.expectedDurationText ?? '');
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!stageSettingsOpen) return;
    setTitleDraft(stage.title);
    setDescriptionDraft(stage.description ?? '');
    setGoalsDraft(stage.goals ?? '');
    setObjectivesDraft(stage.objectives ?? '');
    setDaysDraft(stage.expectedDurationDays != null ? String(stage.expectedDurationDays) : '');
    setTextDraft(stage.expectedDurationText ?? '');
    setSettingsMsg(null);
  }, [
    stageSettingsOpen,
    stage.id,
    stage.title,
    stage.description,
    stage.goals,
    stage.objectives,
    stage.expectedDurationDays,
    stage.expectedDurationText,
  ]);

  const patch = async (body: { status: string; reason?: string | null }) => {
    if (editLocked) return;
    runOrPromptSave(() => {
      void (async () => {
        await runIfProgramInstanceMutationAllowed(programStatus, async () => {
          setSaving(true);
          try {
            const res = await fetch(
              `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stageId)}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              },
            );
            const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              toast.error(readSafeApiErrorText(data, notificationText.commonGenericError));
              return;
            }
            await onPatched();
            toast.success(notificationText.commonSaved);
          } finally {
            setSaving(false);
          }
        });
      })();
    });
  };

  const stageActionsLocked = status === 'completed' || status === 'skipped' || editLocked;

  const submitSkip = async () => {
    if (editLocked) return;
    const reason = skipReasonDraft.trim();
    if (!reason) {
      setSkipDialogError('Укажите причину пропуска');
      return;
    }
    runOrPromptSave(() => {
      void (async () => {
        await runIfProgramInstanceMutationAllowed(programStatus, async () => {
          setSkipDialogError(null);
          setSaving(true);
          try {
            const res = await fetch(
              `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stageId)}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'skipped', reason }),
              },
            );
            const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              toast.error(readSafeApiErrorText(data, notificationText.commonGenericError));
              return;
            }
            await onPatched();
            setSkipDialogOpen(false);
            setSkipReasonDraft('');
            toast.success(notificationText.commonSaved);
          } finally {
            setSaving(false);
          }
        });
      })();
    });
  };

  const saveStageSettings = () => {
    if (editLocked) return;
    const titleTrim = titleDraft.trim();
    if (!titleTrim) {
      setSettingsMsg('Укажите название этапа');
      return;
    }
    const daysTrim = daysDraft.trim();
    let expectedDurationDays: number | null = null;
    if (daysTrim !== '') {
      const n = Number.parseInt(daysTrim, 10);
      if (!Number.isFinite(n) || n < 0 || String(n) !== daysTrim) {
        setSettingsMsg('Срок в днях: неотрицательное целое число');
        return;
      }
      expectedDurationDays = n;
    }
    patchStageMetadata(stageId, {
      title: titleTrim,
      description: descriptionDraft.trim() || null,
      goals: goalsDraft.trim() || null,
      objectives: objectivesDraft.trim() || null,
      expectedDurationDays,
      expectedDurationText: textDraft.trim() || null,
    });
    setStageSettingsOpen(false);
    setSettingsMsg(null);
  };

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex w-full flex-wrap items-center gap-2">
        {status === 'locked' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving || editLocked}
            onClick={() => void patch({ status: 'available' })}
          >
            Открыть этап
          </Button>
        ) : null}
        {status === 'available' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving || editLocked}
            onClick={() => void patch({ status: 'in_progress' })}
          >
            Старт этапа
          </Button>
        ) : null}
        {status === 'completed' || status === 'skipped' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || editLocked}
            onClick={() => void patch({ status: 'in_progress' })}
          >
            Открыть заново
          </Button>
        ) : null}
        <div className="flex flex-nowrap items-center gap-2">
          {status === 'available' || status === 'in_progress' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving || stageActionsLocked}
              onClick={() => void patch({ status: 'completed' })}
            >
              Завершить этап
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving || editLocked}
            onClick={() => setStageSettingsOpen(true)}
          >
            Изменить
          </Button>
        </div>
        <div className="ml-auto flex flex-nowrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={saving || stageActionsLocked}
            onClick={() => {
              setSkipReasonDraft('');
              setSkipDialogError(null);
              setSkipDialogOpen(true);
            }}
          >
            Пропустить этап
          </Button>
        </div>
      </div>
      <Dialog
        open={stageSettingsOpen}
        onOpenChange={(open) => {
          setStageSettingsOpen(open);
          if (!open) setSettingsMsg(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Настройки этапа</DialogTitle>
            <DialogDescription>
              Название, описание, цели и сроки этапа программы. Значения скопированы из шаблона при
              назначении; изменения относятся только к этой программе.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`st-title-${stageId}`}>Название</Label>
              <Input
                id={`st-title-${stageId}`}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={2000}
                disabled={editLocked}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`st-desc-${stageId}`}>Описание</Label>
              <Textarea
                id={`st-desc-${stageId}`}
                rows={3}
                className="text-sm"
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                disabled={editLocked}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <TiptapEditor
                name={`stage_goals_md_${stageId}`}
                label="Цель этапа"
                helpText={null}
                value={goalsDraft}
                onChange={setGoalsDraft}
                disabled={editLocked}
                minHeight={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <TiptapEditor
                name={`stage_objectives_md_${stageId}`}
                label="Задачи этапа"
                helpText={null}
                value={objectivesDraft}
                onChange={setObjectivesDraft}
                disabled={editLocked}
                minHeight={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`st-days-${stageId}`}>Ожидаемый срок, дней</Label>
              <Input
                id={`st-days-${stageId}`}
                className="max-w-[12rem] text-sm"
                inputMode="numeric"
                value={daysDraft}
                onChange={(e) => setDaysDraft(e.target.value)}
                disabled={editLocked}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`st-dur-${stageId}`}>Ожидаемый срок, текстом</Label>
              <Input
                id={`st-dur-${stageId}`}
                className="text-sm"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                disabled={editLocked}
              />
            </div>
            {settingsMsg ? <p className="text-xs text-destructive">{settingsMsg}</p> : null}
          </div>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={editLocked}
              onClick={() => setStageSettingsOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={editLocked || !titleDraft.trim()}
              onClick={() => saveStageSettings()}
            >
              Применить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={skipDialogOpen}
        onOpenChange={(open) => {
          setSkipDialogOpen(open);
          if (!open) {
            setSkipReasonDraft('');
            setSkipDialogError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Пропустить этап</DialogTitle>
            <DialogDescription>
              Этап будет отмечен как пропущенный; укажите причину для журнала.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`skip-reason-${stageId}`}
            >
              Причина пропуска
            </label>
            <Textarea
              id={`skip-reason-${stageId}`}
              rows={3}
              className="text-sm"
              value={skipReasonDraft}
              onChange={(e) => setSkipReasonDraft(e.target.value)}
              disabled={saving}
            />
            {skipDialogError ? <p className="text-xs text-destructive">{skipDialogError}</p> : null}
          </div>
          <DialogFooter className="flex-row flex-nowrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setSkipDialogOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void submitSkip()}
            >
              {saving ? 'Сохранение…' : 'Пропустить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {unsavedDialog}
    </div>
  );
}
