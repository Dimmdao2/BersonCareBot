"use client";

import { Fragment, type ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Activity, BookOpen, ChevronDown, ClipboardList, Layers, MessageSquare } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStatus,
  TreatmentProgramItemType,
} from "@/modules/treatment-program/types";
import type { TreatmentProgramTestResultDetailRow } from "@/modules/treatment-program/types";
import type { TreatmentProgramEventRow } from "@/modules/treatment-program/types";
import type { ProgramActionLogListRow } from "@/modules/treatment-program/types";
import { DoctorProgramActionLogMediaPreview } from "./DoctorProgramActionLogMediaPreview";
import { DoctorProgramItemDiscussionDialog } from "./DoctorProgramItemDiscussionDialog";
import { DoctorProgramInstanceDiscussionDialog } from "./DoctorProgramInstanceDiscussionDialog";
import {
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramStageStatusRu,
  formatProgramActionLogSummaryRu,
  formatLfkPostSessionDifficultyRu,
  shouldOmitTreatmentProgramEventFromDoctorTimeline,
  summarizeTreatmentProgramEventForDoctorRu,
} from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import {
  doctorRecommendationActionabilitySelectItems,
  treatmentProgramGroupSelectNoneItemValue,
  treatmentProgramGroupSelectNoneLabel,
} from "@/shared/ui/selectOpaqueValueLabels";
import { formatBookingDateTimeShortStyleRu } from "@/shared/lib/formatBusinessDateTime";
import { CommentBlock } from "@/components/comments/CommentBlock";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";
import {
  isTreatmentProgramInstanceSystemStageGroup,
  sortDoctorInstanceStageGroupsForDisplay,
} from "@/modules/treatment-program/stage-semantics";
import {
  isProgramInstanceEditLocked,
  runIfProgramInstanceMutationAllowed,
} from "@/app/app/doctor/treatment-program-shared/programInstanceMutationGuard";
import {
  InstanceEditorDraftProvider,
  useInstanceEditorDraft,
} from "@/app/app/doctor/treatment-program-shared/InstanceEditorDraftContext";
import type { InstanceEditorItemStructuralPatch } from "@/app/app/doctor/treatment-program-shared/instanceEditorDraft";
import { InstanceEditorToolbar } from "@/app/app/doctor/treatment-program-shared/InstanceEditorToolbar";
import { InstanceEditorAddStageDialog } from "@/app/app/doctor/treatment-program-shared/InstanceEditorAddStageDialog";
import { InstanceEditorStageOrderDialog } from "@/app/app/doctor/treatment-program-shared/InstanceEditorStageOrderDialog";
import { useInstanceEditorPipelineStageExpansion } from "@/app/app/doctor/treatment-program-shared/useInstanceEditorPipelineStageExpansion";
import { useInstanceEditorUnsavedGate } from "@/app/app/doctor/treatment-program-shared/InstanceEditorUnsavedChangesDialog";
import {
  INSTANCE_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS,
  INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS,
  INSTANCE_HEADER_BG_STAGE_EDITABLE,
  TPL_HEADER_BG_RECOMMENDATIONS,
  instanceGroupHeaderSurfaceStyle,
  tplToolbarTextBtnClass,
} from "@/app/app/doctor/treatment-program-shared/treatmentProgramConstructorShellStyles";
import { TemplateReorderChevrons } from "@/shared/ui/doctor/TemplateReorderChevrons";
import {
  TreatmentProgramSortableItemShell,
  TreatmentProgramStageItemsDnd,
  type TreatmentProgramStageItemsDropPreview,
} from "@/app/app/doctor/treatment-program-shared/TreatmentProgramDndUi";
import {
  computeOrderedItemIdsAfterGroupItemAdjacentSwap,
  planStageItemDndReorder,
  sortByOrderThenId,
} from "@/app/app/doctor/treatment-program-shared/treatmentProgramReorderHelpers";
import {
  InstanceAddLibraryItemDialog,
  TreatmentProgramAddItemSquareButton,
  type InstanceAddLibraryItemSpec,
} from "@/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog";
import type { TreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes";
import { doctorProgramTestResultDomId } from "@/app/app/doctor/treatment-program-shared/doctorProgramTestResultDomId";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { primaryMediaForStageItem } from "@/app/app/patient/treatment/stageItemSnapshot";

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

function itemTitleById(detail: TreatmentProgramInstanceDetail): Map<string, string> {
  const m = new Map<string, string>();
  for (const st of detail.stages) {
    for (const it of st.items) {
      m.set(it.id, snapshotTitle(it.snapshot, it.itemType));
    }
  }
  return m;
}

function stageTitleById(detail: TreatmentProgramInstanceDetail): Map<string, string> {
  const m = new Map<string, string>();
  for (const st of detail.stages) {
    const t = st.title?.trim();
    m.set(st.id, t !== undefined && t !== "" ? t : "Этап");
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

function doctorTimelineWhoRu(actorId: string | null, opts: { currentUserId: string; patientUserId: string }): string | null {
  if (!actorId) return null;
  if (actorId === opts.currentUserId) return "Вы";
  if (actorId === opts.patientUserId) return "Пациент";
  return "Врач";
}

function isPatientObservationActionRow(row: ProgramActionLogListRow): boolean {
  if (row.actionType !== "note") return false;
  const source = row.payload && typeof row.payload.source === "string" ? row.payload.source : null;
  if (source === "patient_media") return true;
  if (!row.note?.trim()) return false;
  return source === "patient_observation";
}

function patientMediaFileIdFromActionRow(row: ProgramActionLogListRow): string | null {
  if (row.actionType !== "note") return null;
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const source = typeof payload.source === "string" ? payload.source : null;
  if (source !== "patient_media") return null;
  const id = typeof payload.mediaFileId === "string" ? payload.mediaFileId.trim() : "";
  return id || null;
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

type InstanceStageT = TreatmentProgramInstanceDetail["stages"][number];
type InstanceStageItemT = InstanceStageT["items"][number];

function isInstanceItemDndEligible(stage: InstanceStageT, item: InstanceStageItemT): boolean {
  if (!item.groupId) return true;
  const g = stage.groups.find((x) => x.id === item.groupId);
  if (!g) return true;
  return !isTreatmentProgramInstanceSystemStageGroup(g);
}

function instanceStageDndItemIds(stage: InstanceStageT): string[] {
  return sortByOrderThenId(stage.items.filter((it) => isInstanceItemDndEligible(stage, it))).map((it) => it.id);
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

function sameInstanceGroupKey(item: { groupId: string | null | undefined }, groupId: string | null): boolean {
  return (item.groupId ?? null) === (groupId ?? null);
}

function buildInstanceStageItemDropPreviewPlacement(
  stage: InstanceStageT,
  dropPreview: TreatmentProgramStageItemsDropPreview,
): InstanceStageItemDropPreviewPlacement | null {
  if (!dropPreview) return null;
  const canParticipate = (it: InstanceStageItemT) => isInstanceItemDndEligible(stage, it);
  const plan = planStageItemDndReorder(stage.items, dropPreview.activeId, dropPreview.overId, canParticipate);
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

function pickFirstFiniteNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Разбор «нагрузки» без ссылки на целый `item` — чтобы `useEffect` мог иметь точные зависимости (exhaustive-deps). */
function effectiveLoadTripleFromParts(
  itemType: TreatmentProgramItemType,
  settings: Record<string, unknown> | null,
  snapshot: Record<string, unknown>,
): {
  reps: number | null;
  sets: number | null;
  maxPain: number | null;
} {
  const ov =
    settings != null && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  if (itemType === "exercise") {
    return {
      reps: pickFirstFiniteNum(ov.reps, snapshot.reps),
      sets: pickFirstFiniteNum(ov.sets, snapshot.sets),
      maxPain: pickFirstFiniteNum(ov.maxPain, snapshot.maxPain, snapshot.difficulty),
    };
  }
  return { reps: null, sets: null, maxPain: null };
}

function DoctorInstanceStageItemPreviewBlock(props: { item: InstanceStageItemT }) {
  const { item } = props;
  const media = useMemo(
    () => primaryMediaForStageItem(item as Parameters<typeof primaryMediaForStageItem>[0]),
    [item],
  );
  const frameEmpty =
    "flex size-[70px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/15";
  const frameThumb = "size-[70px] shrink-0 rounded-md border border-border/60 bg-muted/15";
  if (!media) {
    const icon =
      item.itemType === "recommendation" ? (
        <MessageSquare className="size-7 text-muted-foreground" aria-hidden />
      ) : item.itemType === "clinical_test" ? (
        <ClipboardList className="size-7 text-muted-foreground" aria-hidden />
      ) : item.itemType === "lesson" ? (
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
  return (
    <PatientCatalogMediaStaticThumb
      media={media}
      frameClassName={frameThumb}
      sizes="70px"
    />
  );
}

function parseLoadField(raw: string, label: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || String(n) !== t.trim()) {
    throw new Error(`${label}: целое число или пусто`);
  }
  return n;
}

function DoctorInstanceStageItemLoadForm(props: {
  item: InstanceStageItemT;
  editLocked: boolean;
}) {
  const { item, editLocked } = props;
  const { patchItemLoadSettings } = useInstanceEditorDraft();
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState("");
  const [maxPain, setMaxPain] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const e = effectiveLoadTripleFromParts(item.itemType, item.settings, item.snapshot);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync load draft fields when item changes
    setReps(e.reps != null ? String(e.reps) : "");
    setSets(e.sets != null ? String(e.sets) : "");
    setMaxPain(e.maxPain != null ? String(e.maxPain) : "");
    setMsg(null);
  }, [item.id, item.itemType, item.settings, item.snapshot]);

  const applyLoadDraft = (nextReps: string, nextSets: string, nextMaxPain: string) => {
    if (editLocked) return;
    try {
      patchItemLoadSettings(item.id, {
        reps: parseLoadField(nextReps, "Повторы"),
        sets: parseLoadField(nextSets, "Подходы"),
        maxPain: parseLoadField(nextMaxPain, "Макс. боль"),
      });
      setMsg(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Ошибка");
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
  const recPhase0 = phaseZeroRecommendation && item.itemType === "recommendation";
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const hasLocalCommentOverride = Boolean(item.localComment?.trim());
  return (
    <details className="group rounded-lg border border-border/80 bg-muted/20 open:shadow-sm">
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
            <TemplateReorderChevrons
              compact
              className="-my-0.5"
              disabled={reorderInGroup.disableAll}
              disableUp={reorderInGroup.disableUp}
              disableDown={reorderInGroup.disableDown}
              ariaLabelUp="Выше в группе"
              ariaLabelDown="Ниже в группе"
              onUp={() => void reorderInGroup.onMove(-1)}
              onDown={() => void reorderInGroup.onMove(1)}
            />
          </div>
        ) : null}
        <p className="min-w-0 flex-1 text-sm font-medium">
          <span className="truncate">{snapshotTitle(item.snapshot, item.itemType)}</span>{" "}
          {recPhase0 ? null : (
            <span className="font-normal text-muted-foreground">({item.itemType})</span>
          )}
        </p>
        {hasLocalCommentOverride ? (
          <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
            Комментарий: своё
          </Badge>
        ) : null}
        <span className="shrink-0 text-xs text-muted-foreground group-open:hidden">Развернуть</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground group-open:inline">Свернуть</span>
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
            {item.itemType === "exercise" ? (
              <DoctorInstanceStageItemLoadForm item={item} editLocked={editLocked} />
            ) : null}
            {item.itemType === "clinical_test" ? <ClinicalTestCatalogSnapshotLines snapshot={item.snapshot} /> : null}
            <ItemLocalCommentForm
              key={`${item.id}:${item.localComment ?? ""}`}
              itemId={item.id}
              editLocked={editLocked}
              initialDraft={item.localComment ?? ""}
              placeholder={item.comment?.trim() ? `Из шаблона: ${item.comment.trim()}` : "Из шаблона: —"}
            />
          </div>
        </div>
      </div>
    </details>
  );
}

/** Завершение экземпляра программы (не путать с «Завершить этап» у отдельного этапа). */
function ProgramInstanceCompleteControl(props: {
  instanceId: string;
  status: TreatmentProgramInstanceDetail["status"];
  onPatched: () => Promise<void>;
}) {
  const { instanceId, status, onPatched } = props;
  const { runOrPromptSave, unsavedDialog } = useInstanceEditorUnsavedGate({
    description:
      "Есть несохранённые правки названий, комментариев и нагрузки. Сохраните или отмените их перед завершением программы.",
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (status !== "active") return null;

  const complete = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(data.error ?? "Ошибка");
        return;
      }
      setOpen(false);
      await onPatched();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={saving}
          onClick={() => runOrPromptSave(() => setOpen(true))}
        >
          Завершить программу лечения
        </Button>
        {msg ? (
          <span className="text-xs text-destructive" role="alert">
            {msg}
          </span>
        ) : null}
      </div>
      {unsavedDialog}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Завершить программу лечения?</DialogTitle>
            <DialogDescription>
              У пациента программа будет отмечена как завершённая. После этого при необходимости можно назначить новую
              активную программу.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void complete()}>
              {saving ? "Сохранение…" : "Завершить программу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DoctorInstancePipelineStageBlock(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
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
    <section
      className={INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS}
      data-testid={`instance-editor-pipeline-stage-${stage.id}`}
      data-expanded={expanded ? "true" : "false"}
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
                <h3 className="mt-0.5 text-sm font-semibold leading-tight text-foreground">{stage.title}</h3>
                {stage.description?.trim() ? (
                  <p className="mt-1 text-xs leading-snug whitespace-pre-wrap text-muted-foreground">
                    {stage.description.trim()}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wide">{formatTreatmentProgramStageStatusRu(stage.status)}</span>
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
    </section>
  );
}

export function TreatmentProgramInstanceDetailClient(props: {
  /** Карточка клиента (с тем же `scope`, что и «Назад» в шапке). */
  patientProfileHref: string;
  patientDisplayName: string;
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  /** attemptId → врач может принять эту попытку (актуальный хвост, ещё не принята). */
  initialAttemptAcceptMap: Record<string, boolean>;
  initialEvents: TreatmentProgramEventRow[];
  initialActionLog: ProgramActionLogListRow[];
  currentUserId: string;
  isAdmin?: boolean;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  doctorReplyFromLogEnabled: boolean;
  initialOpenDiscussionItemId?: string | null;
  initialFocusTestResultId?: string | null;
}) {
  const [baseline, setBaseline] = useState(props.initial);
  const [programEvents, setProgramEvents] = useState<TreatmentProgramEventRow[]>(props.initialEvents);
  const [actionLog, setActionLog] = useState<ProgramActionLogListRow[]>(props.initialActionLog);

  const refreshBaseline = useCallback(async () => {
    const res = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(baseline.id)}`);
    const data = (await res.json().catch(() => null)) as { ok?: boolean; item?: TreatmentProgramInstanceDetail };
    if (!res.ok || !data.ok || !data.item) {
      throw new Error("Не удалось обновить данные");
    }
    setBaseline(data.item);
    const evRes = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(baseline.id)}/events`);
    const evData = (await evRes.json().catch(() => null)) as { ok?: boolean; events?: TreatmentProgramEventRow[] };
    if (evRes.ok && evData.ok && evData.events) setProgramEvents(evData.events);
    const alRes = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(baseline.id)}/action-log`);
    const alData = (await alRes.json().catch(() => null)) as {
      ok?: boolean;
      entries?: ProgramActionLogListRow[];
    };
    if (alRes.ok && alData.ok && alData.entries) setActionLog(alData.entries);
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
        setBaseline={setBaseline}
        programEvents={programEvents}
        setProgramEvents={setProgramEvents}
        actionLog={actionLog}
        setActionLog={setActionLog}
        refreshBaseline={refreshBaseline}
      />
    </InstanceEditorDraftProvider>
  );
}

function TreatmentProgramInstanceDetailClientBody(props: {
  patientProfileHref: string;
  patientDisplayName: string;
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  initialAttemptAcceptMap: Record<string, boolean>;
  initialEvents: TreatmentProgramEventRow[];
  initialActionLog: ProgramActionLogListRow[];
  currentUserId: string;
  isAdmin?: boolean;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  doctorReplyFromLogEnabled: boolean;
  initialOpenDiscussionItemId?: string | null;
  initialFocusTestResultId?: string | null;
  baseline: TreatmentProgramInstanceDetail;
  setBaseline: (detail: TreatmentProgramInstanceDetail) => void;
  programEvents: TreatmentProgramEventRow[];
  setProgramEvents: (events: TreatmentProgramEventRow[]) => void;
  actionLog: ProgramActionLogListRow[];
  setActionLog: (rows: ProgramActionLogListRow[]) => void;
  refreshBaseline: () => Promise<void>;
}) {
  const {
    patientProfileHref,
    patientDisplayName,
    initialOpenDiscussionItemId,
    initialFocusTestResultId,
    initialTestResults,
    initialAttemptAcceptMap,
    currentUserId,
    isAdmin = false,
    appDisplayTimeZone,
    treatmentProgramLibrary,
    doctorReplyFromLogEnabled,
    baseline,
    programEvents,
    setProgramEvents,
    actionLog,
    setActionLog,
    refreshBaseline,
  } = props;
  const { displayDetail, setItemReorder } = useInstanceEditorDraft();
  const detail = displayDetail;
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TreatmentProgramTestResultDetailRow[]>(initialTestResults);
  const [attemptAcceptMap, setAttemptAcceptMap] = useState<Record<string, boolean>>(initialAttemptAcceptMap);
  const [addLibrarySpec, setAddLibrarySpec] = useState<InstanceAddLibraryItemSpec | null>(null);
  const [noteReplyOpen, setNoteReplyOpen] = useState(false);
  const [noteReplyTarget, setNoteReplyTarget] = useState<ProgramActionLogListRow | null>(null);
  const [noteReplyDraft, setNoteReplyDraft] = useState("");
  const [noteReplySaving, setNoteReplySaving] = useState(false);
  const [noteReplyError, setNoteReplyError] = useState<string | null>(null);
  const [discussionTarget, setDiscussionTarget] = useState<{ itemId: string; label: string } | null>(null);
  const [instanceDiscussionOpen, setInstanceDiscussionOpen] = useState(false);
  const [addStageDialogOpen, setAddStageDialogOpen] = useState(false);
  const [stageOrderDialogOpen, setStageOrderDialogOpen] = useState(false);

  const itemTitles = useMemo(() => itemTitleById(detail), [detail]);
  const stageTitles = useMemo(() => stageTitleById(detail), [detail]);
  const doctorTimelineEvents = useMemo(
    () => programEvents.filter((e) => !shouldOmitTreatmentProgramEventFromDoctorTimeline(e)),
    [programEvents],
  );
  const eventLabels = useMemo(
    () => ({
      itemTitle: (id: string) => itemTitles.get(id),
      stageTitle: (id: string) => stageTitles.get(id),
    }),
    [itemTitles, stageTitles],
  );
  const assignedByLabel = useMemo(
    () => doctorTimelineWhoRu(detail.assignedBy, { currentUserId, patientUserId: detail.patientUserId }),
    [detail.assignedBy, detail.patientUserId, currentUserId],
  );

  const sortedStages = useMemo(
    () => [...detail.stages].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [detail.stages],
  );
  const pipelineStages = useMemo(() => sortedStages.filter((s) => s.sortOrder > 0), [sortedStages]);
  const { isStageExpanded, setStageExpanded } = useInstanceEditorPipelineStageExpansion(
    pipelineStages.map((stage) => ({ id: stage.id, sortOrder: stage.sortOrder, status: stage.status })),
  );
  const stageZero = useMemo(
    () => sortedStages.find((s) => s.sortOrder === 0) ?? null,
    [sortedStages],
  );
  const phaseZeroRecommendations = useMemo(
    () =>
      stageZero
        ? sortByOrderThenId(stageZero.items.filter((it) => it.itemType === "recommendation"))
        : [],
    [stageZero],
  );

  const discussionProgramItems = useMemo(
    () =>
      sortedStages.flatMap((stage) =>
        sortByOrderThenId(stage.items).map((item) => ({
          id: item.id,
          label: itemTitles.get(item.id) ?? "Элемент",
        })),
      ),
    [sortedStages, itemTitles],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await refreshBaseline();
    } catch {
      setError("Не удалось обновить данные");
    }
  }, [refreshBaseline]);

  const refreshResults = useCallback(async () => {
    const res = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-results`);
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
      const ordered = computeOrderedItemIdsAfterGroupItemAdjacentSwap(stageZero.items, null, itemId, dir, {
        itemInReorderBand: (it) => it.itemType === "recommendation",
      });
      if (!ordered) return;
      setItemReorder(stageZero.id, ordered);
    },
    [stageZero, setItemReorder],
  );

  const openProgramNoteReplyDialog = useCallback((row: ProgramActionLogListRow) => {
    if (!doctorReplyFromLogEnabled) return;
    if (!isPatientObservationActionRow(row)) return;
    setNoteReplyTarget(row);
    setNoteReplyDraft("");
    setNoteReplyError(null);
    setNoteReplyOpen(true);
  }, [doctorReplyFromLogEnabled]);

  const openDiscussionDialog = useCallback(
    (row: ProgramActionLogListRow) => {
      const itemLabel = itemTitles.get(row.instanceStageItemId) ?? "Элемент";
      setDiscussionTarget({ itemId: row.instanceStageItemId, label: itemLabel });
    },
    [itemTitles],
  );

  const openDiscussionForItemId = useCallback(
    (itemId: string) => {
      const itemLabel = itemTitles.get(itemId) ?? "Элемент";
      setDiscussionTarget({ itemId, label: itemLabel });
    },
    [itemTitles],
  );

  useEffect(() => {
    const id = initialOpenDiscussionItemId?.trim();
    if (!id) return;
    openDiscussionForItemId(id);
  }, [initialOpenDiscussionItemId, openDiscussionForItemId]);

  useEffect(() => {
    const resultId = initialFocusTestResultId?.trim();
    if (!resultId) return;

    let cancelled = false;
    let highlightTimer: number | undefined;
    let retryTimer: number | undefined;
    let attempts = 0;
    const maxAttempts = 20;

    const applyHighlight = (el: HTMLElement) => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-lg");
      highlightTimer = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-lg");
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

  const sendProgramNoteReply = useCallback(async () => {
    if (!noteReplyTarget) return;
    const text = noteReplyDraft.trim();
    if (!text) {
      setNoteReplyError("Введите ответ");
      return;
    }
    setNoteReplySaving(true);
    setNoteReplyError(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/items/${encodeURIComponent(noteReplyTarget.instanceStageItemId)}/program-note-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data?.ok) {
        setNoteReplyError(
          data?.error === "feature_disabled"
            ? "Функция временно отключена"
            : data?.error === "program_not_doctor_assigned"
              ? "Ответы доступны только для программ, назначенных врачом"
              : data?.error === "program_item_not_active"
                ? "Элемент уже не активен"
                : data?.error === "not_found" || data?.error === "stage_item_not_found"
                  ? "Элемент не найден"
                  : data?.error ?? "Не удалось отправить ответ",
        );
        return;
      }
      setNoteReplyOpen(false);
      setNoteReplyTarget(null);
      setNoteReplyDraft("");
      toast.success("Ответ отправлен");
    } finally {
      setNoteReplySaving(false);
    }
  }, [detail.id, noteReplyDraft, noteReplyTarget]);

  return (
    <div className="flex flex-col gap-4">
      <InstanceEditorToolbar
        programTitle={detail.title}
        patientProfileHref={patientProfileHref}
        patientDisplayName={patientDisplayName}
        programStatus={detail.status}
        pipelineStageCount={pipelineStages.length}
        onCommentsClick={() => setInstanceDiscussionOpen(true)}
        onAddStageClick={() => setAddStageDialogOpen(true)}
        onChangeStageOrderClick={() => setStageOrderDialogOpen(true)}
      />
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
      <DoctorProgramInstanceDiscussionDialog
        open={instanceDiscussionOpen}
        onOpenChange={setInstanceDiscussionOpen}
        instanceId={detail.id}
        programItems={discussionProgramItems}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4" id="doctor-program-instance-left">
          <section className="rounded-xl border border-border bg-card p-4" id="doctor-program-instance-summary">
            <ProgramInstanceCompleteControl instanceId={detail.id} status={detail.status} onPatched={refresh} />
          </section>

          <div id="doctor-program-instance-comments">
          <CommentBlock
            targetType="program_instance"
            targetId={detail.id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            mutationsDisabled={detail.status === "completed"}
            title="Комментарии к программе"
          />
          </div>

          <section
            className={INSTANCE_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS}
            id="doctor-program-instance-phase0-recommendations"
          >
            <div
              className="flex items-center justify-between gap-2 border-b border-border/25 px-2 py-2"
              style={{ background: TPL_HEADER_BG_RECOMMENDATIONS }}
            >
              <h3 className="text-sm font-semibold leading-tight text-foreground">Общие рекомендации (этап 0)</h3>
              {stageZero ? (
                <TreatmentProgramAddItemSquareButton
                  disabled={isProgramInstanceEditLocked(detail.status)}
                  onClick={() =>
                    setAddLibrarySpec({
                      stageId: stageZero.id,
                      context: "phase_zero_recommendations",
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
          </section>

          <section className="rounded-xl border border-border bg-card p-4" id="doctor-program-instance-action-log">
            <h3 className="text-base font-semibold">Журнал выполнения</h3>
            {actionLog.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Пока нет записей в журнале.</p>
            ) : (
              <ul className="mt-3 max-h-80 list-none space-y-2 overflow-y-auto pl-0 text-sm">
                {actionLog.map((row) => {
                  const itemLabel = itemTitles.get(row.instanceStageItemId) ?? "Элемент";
                  const diffRu = formatLfkPostSessionDifficultyRu(row.payload?.difficulty);
                  const canReply = doctorReplyFromLogEnabled && isPatientObservationActionRow(row);
                  const showDiscussion = isPatientObservationActionRow(row) || Boolean(patientMediaFileIdFromActionRow(row));
                  return (
                    <li
                      key={row.id}
                      className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5"
                    >
                      <span className="text-xs text-muted-foreground">
                        {formatBookingDateTimeShortStyleRu(row.createdAt, appDisplayTimeZone)}
                      </span>
                      <span className="ml-2 font-medium">{formatProgramActionLogSummaryRu(row)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">· {itemLabel}</span>
                      {row.actionType === "done" && diffRu ? (
                        <span className="mt-0.5 block text-xs text-foreground/90">Как прошло: {diffRu}</span>
                      ) : null}
                      {row.note?.trim() ? (
                        <span className="mt-0.5 block text-xs text-foreground/90">Заметка пациента: {row.note}</span>
                      ) : null}
                      {patientMediaFileIdFromActionRow(row) ? (
                        <DoctorProgramActionLogMediaPreview mediaFileId={patientMediaFileIdFromActionRow(row)!} />
                      ) : null}
                      {showDiscussion || canReply ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {showDiscussion ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openDiscussionDialog(row)}
                            >
                              Обсуждение
                            </Button>
                          ) : null}
                          {canReply ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openProgramNoteReplyDialog(row)}
                            >
                              Ответить
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4" id="doctor-program-instance-events">
            <h3 className="text-base font-semibold">История правок программы</h3>
            <ul className="mt-3 max-h-80 list-none space-y-2 overflow-y-auto pl-0 text-sm">
              <li className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {formatBookingDateTimeShortStyleRu(detail.createdAt, appDisplayTimeZone)}
                </span>
                <span className="ml-2 font-medium">Программа назначена</span>
                {assignedByLabel ? (
                  <span className="ml-1 text-xs text-muted-foreground">· {assignedByLabel}</span>
                ) : null}
              </li>
              {doctorTimelineEvents.length === 0 ? (
                <li className="rounded-md border border-dashed border-border/70 px-2 py-2 text-sm text-muted-foreground">
                  Дальше появятся изменения плана и прохождение этапов (отметки выполнения пунктов — в «Журнале
                  выполнения»).
                </li>
              ) : (
                doctorTimelineEvents.map((e) => {
                  const who = doctorTimelineWhoRu(e.actorId, {
                    currentUserId,
                    patientUserId: detail.patientUserId,
                  });
                  return (
                    <li key={e.id} className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">
                        {formatBookingDateTimeShortStyleRu(e.createdAt, appDisplayTimeZone)}
                      </span>
                      <span className="ml-2 font-medium">{summarizeTreatmentProgramEventForDoctorRu(e, eventLabels)}</span>
                      {who ? <span className="ml-1 text-xs text-muted-foreground">· {who}</span> : null}
                      {e.reason ? (
                        <span className="mt-0.5 block text-xs text-foreground/90">Комментарий: {e.reason}</span>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {testResults.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4" id="doctor-program-instance-test-results">
              <h3 className="text-base font-semibold">Результаты тестов</h3>
              <ul className="mt-3 space-y-3 text-sm">
                {groupTestResultsByAttempt(testResults).map((g) => {
                  const pending = g.results.filter((x) => !x.decidedBy).length;
                  return (
                    <li key={g.attemptId} className="rounded-lg border border-border/70 bg-muted/15 p-2">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                        <p className="text-xs text-muted-foreground">
                          {g.submittedAt
                            ? `Отправлено: ${g.submittedAt.slice(0, 19).replace("T", " ")}`
                            : `Начато: ${g.startedAt.slice(0, 19).replace("T", " ")}`}
                          {g.acceptedAt ? ` · принято: ${g.acceptedAt.slice(0, 19).replace("T", " ")}` : ""}
                          {pending > 0 ? ` · без оценки: ${pending}` : ""}
                        </p>
                        {g.submittedAt &&
                        !g.acceptedAt &&
                        detail.status !== "completed" &&
                        attemptAcceptMap[g.attemptId] ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await runIfProgramInstanceMutationAllowed(detail.status, async () => {
                                const res = await fetch(
                                  `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-attempts/${encodeURIComponent(g.attemptId)}/accept`,
                                  { method: "POST" },
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
                              {r.testTitle ?? r.testId}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                ({r.stageTitle}) · {formatNormalizedTestDecisionRu(r.normalizedDecision)} (
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
                              {(["passed", "failed", "partial"] as const).map((d) => (
                                <Button
                                  key={d}
                                  type="button"
                                  size="sm"
                                  variant={r.normalizedDecision === d ? "default" : "outline"}
                                  disabled={detail.status === "completed"}
                                  onClick={async () => {
                                    await runIfProgramInstanceMutationAllowed(detail.status, async () => {
                                      const res = await fetch(
                                        `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-results/${encodeURIComponent(r.id)}`,
                                        {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ normalizedDecision: d }),
                                        },
                                      );
                                      if (res.ok) void refreshResults();
                                    });
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
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4" id="doctor-program-instance-right">
          <div id="doctor-program-instance-pipeline" className="flex flex-col gap-4">
            {pipelineStages.map((stage) => (
              <DoctorInstancePipelineStageBlock
                key={stage.id}
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
        </div>
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
      <Dialog
        open={noteReplyOpen}
        onOpenChange={(open) => {
          setNoteReplyOpen(open);
          if (!open) {
            setNoteReplyError(null);
            setNoteReplySaving(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ответ на заметку пациента</DialogTitle>
            <DialogDescription>
              {noteReplyTarget?.note?.trim() ? `Заметка: ${noteReplyTarget.note.trim()}` : "Добавьте ответ"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doctor-program-note-reply-text">Ответ</Label>
            <Textarea
              id="doctor-program-note-reply-text"
              value={noteReplyDraft}
              onChange={(event) => setNoteReplyDraft(event.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Введите ответ"
            />
            {noteReplyError ? (
              <p className="text-xs text-destructive" role="alert">
                {noteReplyError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={noteReplySaving}
              onClick={() => setNoteReplyOpen(false)}
            >
              Отмена
            </Button>
            <Button type="button" disabled={noteReplySaving} onClick={() => void sendProgramNoteReply()}>
              {noteReplySaving ? "Отправка…" : "Отправить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {discussionTarget ? (
        <DoctorProgramItemDiscussionDialog
          instanceId={detail.id}
          itemId={discussionTarget.itemId}
          itemLabel={discussionTarget.label}
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
  stage: TreatmentProgramInstanceDetail["stages"][number];
  testResults: TreatmentProgramTestResultDetailRow[];
  programStatus: TreatmentProgramInstanceStatus;
  newGroupOpen: boolean;
  onNewGroupOpenChange: (open: boolean) => void;
  onRequestAddLibraryItem: (spec: InstanceAddLibraryItemSpec) => void;
}) {
  const { stage, testResults, programStatus, newGroupOpen, onNewGroupOpenChange, onRequestAddLibraryItem } = props;
  const { patchGroup, setGroupReorder, setItemReorder, patchItemStructural, hideGroup, addGroupCreate } =
    useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const [title, setTitle] = useState("");
  const [groupEdit, setGroupEdit] = useState<{
    id: string;
    title: string;
    description: string;
    scheduleText: string;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const displayStage = stage;
  const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups);
  const userGroupsOrdered = sortedGroups.filter((g) => !g.systemKind);
  const ungrouped = sortByOrderThenId(displayStage.items.filter((it) => !it.groupId));
  const hasUngrouped = ungrouped.length > 0;
  const hasGroups = sortedGroups.length > 0;
  const isEmptyStage = !hasUngrouped && !hasGroups && displayStage.items.length === 0;

  const editingGroupMeta = groupEdit ? stage.groups.find((g) => g.id === groupEdit.id) : null;
  const editingIsSystem = editingGroupMeta ? isTreatmentProgramInstanceSystemStageGroup(editingGroupMeta) : false;

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
    setMsg(null);
    setGroupReorder(stage.id, newOrder);
  };

  const reorderItemInStageGroup = (groupId: string | null, itemId: string, dir: -1 | 1) => {
    if (editLocked) return;
    const ordered = computeOrderedItemIdsAfterGroupItemAdjacentSwap(stage.items, groupId, itemId, dir);
    if (!ordered) return;
    setMsg(null);
    setItemReorder(stage.id, ordered);
  };

  const handleItemDnd = (activeId: string, overId: string) => {
    if (editLocked) return;
    const canParticipate = (it: InstanceStageItemT) => isInstanceItemDndEligible(displayStage, it);
    const plan = planStageItemDndReorder(displayStage.items, activeId, overId, canParticipate);
    if (!plan.ok) {
      if (plan.error === "ungrouped_type") {
        setMsg("Без группы допустимы только рекомендации и клинические тесты");
      } else {
        setMsg("Не удалось изменить порядок элементов");
      }
      return;
    }
    setMsg(null);
    if (plan.needsGroupPatch) {
      patchItemStructural(activeId, { groupId: plan.nextGroupId });
    }
    setItemReorder(stage.id, plan.orderedItemIds);
  };

  const dndItemIds = instanceStageDndItemIds(displayStage);

  const hideGroupFromModal = () => {
    if (!groupEdit) return;
    if (editLocked) return;
    const merged =
      programStatus === "active"
        ? "Применить к активной программе пациента? Элементы группы будут скрыты у пациента, группа удалена. Продолжить?"
        : "Элементы группы будут скрыты у пациента, сама группа удалена. Продолжить?";
    if (!globalThis.confirm(merged)) return;
    setMsg(null);
    hideGroup(groupEdit.id);
    setGroupEdit(null);
  };

  const addGroup = () => {
    if (editLocked) return;
    const t = title.trim();
    if (!t) return;
    addGroupCreate({ stageId: stage.id, title: t });
    setTitle("");
    onNewGroupOpenChange(false);
    setMsg(null);
  };

  const saveGroupEdit = () => {
    if (!groupEdit) return;
    if (editLocked) return;
    const gMeta = stage.groups.find((g) => g.id === groupEdit.id);
    const isSysGroup = gMeta ? isTreatmentProgramInstanceSystemStageGroup(gMeta) : false;
    if (!isSysGroup) {
      const t = groupEdit.title.trim();
      if (!t) {
        setMsg("Название группы не может быть пустым");
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
    setMsg(null);
  };

  const shouldRenderDropPreviewBeforeItem = (
    placement: InstanceStageItemDropPreviewPlacement | null,
    groupId: string | null,
    items: InstanceStageItemT[],
    index: number,
  ): boolean => {
    if (!placement || placement.groupId !== groupId) return false;
    const nonActiveBefore = items.slice(0, index).filter((item) => item.id !== placement.activeId).length;
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
            const dropPreviewPlacement = buildInstanceStageItemDropPreviewPlacement(displayStage, dropPreview);
            return (
          <div className="mt-1 space-y-3">
            {sortedGroups.map((g) => {
            const gItems = sortByOrderThenId(displayStage.items.filter((it) => it.groupId === g.id));
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
                    <p className="text-sm font-semibold leading-snug text-foreground">{g.title}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      Элементов: {gItems.length}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
                    <TreatmentProgramAddItemSquareButton
                      disabled={editLocked}
                      onClick={() => {
                        if (isSys) {
                          if (g.systemKind === "recommendations") {
                            onRequestAddLibraryItem({
                              stageId: stage.id,
                              context: "stage_system_recommendations",
                              customGroupId: null,
                            });
                          } else {
                            onRequestAddLibraryItem({
                              stageId: stage.id,
                              context: "stage_system_tests",
                              customGroupId: null,
                            });
                          }
                        } else {
                          onRequestAddLibraryItem({
                            stageId: stage.id,
                            context: "custom_group",
                            customGroupId: g.id,
                          });
                        }
                      }}
                    />
                    {!isSys ? (
                      <>
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
                              description: g.description ?? "",
                              scheduleText: g.scheduleText ?? "",
                            })
                          }
                        >
                          Изменить
                        </Button>
                        <TemplateReorderChevrons
                          compact
                          className="-mt-px shrink-0"
                          disabled={editLocked}
                          disableUp={userIdx <= 0}
                          disableDown={userIdx < 0 || userIdx >= userGroupsOrdered.length - 1}
                          ariaLabelUp="Группа выше"
                          ariaLabelDown="Группа ниже"
                          onUp={() => void reorder(g.id, -1)}
                          onDown={() => void reorder(g.id, 1)}
                        />
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
                            description: g.description ?? "",
                            scheduleText: g.scheduleText ?? "",
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
                    <p className="py-2 text-xs text-muted-foreground">В группе пока нет элементов.</p>
                  ) : (
                    <ul className="space-y-px">
                      {gItems.map((item, idx) => {
                        const dndEligible = isInstanceItemDndEligible(displayStage, item);
                        const dropPreviewBefore = shouldRenderDropPreviewBeforeItem(dropPreviewPlacement, g.id, gItems, idx);
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
                              onMove: (dir) => void reorderItemInStageGroup(g.id, item.id, dir),
                            }}
                          />
                        );
                        if (!dndEligible) {
                          return (
                            <Fragment key={item.id}>
                              {dropPreviewBefore ? <InstanceStageItemDropPreviewMarker /> : null}
                              <li className="list-none px-1 py-1.5">{card}</li>
                            </Fragment>
                          );
                        }
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
                                    disableDown: idx >= gItems.length - 1,
                                    onMove: (dir) => void reorderItemInStageGroup(g.id, item.id, dir),
                                  }}
                                />
                              )}
                            </TreatmentProgramSortableItemShell>
                          </Fragment>
                        );
                      })}
                      {shouldRenderDropPreviewAfterItems(dropPreviewPlacement, g.id, gItems) ? (
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
                                onMove: (dir) => void reorderItemInStageGroup(null, item.id, dir),
                              }}
                            />
                          )}
                        </TreatmentProgramSortableItemShell>
                      </Fragment>
                    );
                  })}
                  {shouldRenderDropPreviewAfterItems(dropPreviewPlacement, null, ungrouped) ? (
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
      {msg ? <p className="mt-2 text-xs text-destructive">{msg}</p> : null}
      <Dialog open={newGroupOpen} modal={false} onOpenChange={onNewGroupOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
            <DialogDescription>Группа для объединения пунктов внутри этапа.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`ng-${stage.id}`}>Название</Label>
            <Input id={`ng-${stage.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
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
                  ? "Поля описания и расписания; название системной группы фиксировано."
                  : "Название, описание и расписание группы."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`eg-title-${groupEdit.id}`}>Название</Label>
                <Input
                  id={`eg-title-${groupEdit.id}`}
                  value={groupEdit.title}
                  onChange={(e) => setGroupEdit((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
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
                  onChange={(e) => setGroupEdit((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
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
                  onChange={(e) => setGroupEdit((prev) => (prev ? { ...prev, scheduleText: e.target.value } : prev))}
                  maxLength={5000}
                  disabled={false}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setGroupEdit(null)}>
                Отмена
              </Button>
              {editingIsSystem ? null : (
                <Button type="button" variant="destructive" disabled={editLocked} onClick={() => void hideGroupFromModal()}>
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
  item: TreatmentProgramInstanceDetail["stages"][number]["items"][number];
  groups: TreatmentProgramInstanceDetail["stages"][number]["groups"];
  testResults: TreatmentProgramTestResultDetailRow[];
  editLocked: boolean;
  /** Скрыть выбор группы (блок рекомендаций этапа 0). */
  hideGroupSelect?: boolean;
}) {
  const { item, groups, testResults, editLocked, hideGroupSelect = false } = props;
  const { patchItemStructural, deleteItem: deleteItemDraft } = useInstanceEditorDraft();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const hasHistory = Boolean(item.completedAt) || testResults.some((r) => r.instanceStageItemId === item.id);

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
    setMsg(null);
    patchItemStructural(item.id, patch);
  };

  const deleteItem = () => {
    if (editLocked) return;
    deleteItemDraft(item.id);
    setDeleteConfirmOpen(false);
  };

  const recActionabilityValue = item.isActionable === false ? "persistent" : "actionable";
  const groupSelectValue = item.groupId ?? treatmentProgramGroupSelectNoneItemValue;

  return (
    <div className={cn("flex flex-col gap-3", item.status === "disabled" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.status === "disabled" ? "secondary" : "default"}>
          {item.status === "disabled" ? "Отключено" : "Активно"}
        </Badge>
        {item.itemType === "recommendation" ? (
          <Select
            value={recActionabilityValue}
            onValueChange={(v) => applyStructural({ isActionable: v === "actionable" })}
            disabled={editLocked}
            items={doctorRecommendationActionabilitySelectItems}
          >
            <SelectTrigger
              className="h-8 w-full min-w-0 max-w-xs text-xs sm:w-[220px]"
              size="sm"
              displayLabel={doctorRecommendationActionabilitySelectItems[recActionabilityValue]}
            />
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
            onValueChange={(v) => applyStructural({ groupId: v === "__none__" ? null : v })}
            disabled={editLocked}
            items={groupSelectItems}
          >
            <SelectTrigger
              className="h-8 w-full text-xs"
              size="sm"
              displayLabel={groupSelectItems[groupSelectValue]}
            />
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
        {item.status === "active" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={editLocked}
            onClick={() => {
              if (hasHistory) setConfirmOpen(true);
              else applyStructural({ status: "disabled" });
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
            onClick={() => applyStructural({ status: "active" })}
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
      {msg ? <p className="text-xs text-destructive">{msg}</p> : null}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отключить элемент?</DialogTitle>
            <DialogDescription>
              У элемента уже есть выполнение или результат теста. Он будет скрыт у пациента, история сохранится.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                applyStructural({ status: "disabled" });
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
              Строка будет удалена из программы пациента без возможности восстановления. Если у элемента есть
              выполнение или попытка теста, удаление будет отклонено.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
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
  stage: TreatmentProgramInstanceDetail["stages"][number];
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
  const [skipReasonDraft, setSkipReasonDraft] = useState("");
  const [skipDialogError, setSkipDialogError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [stageSettingsOpen, setStageSettingsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stage.title);
  const [descriptionDraft, setDescriptionDraft] = useState(stage.description ?? "");
  const [goalsDraft, setGoalsDraft] = useState(stage.goals ?? "");
  const [objectivesDraft, setObjectivesDraft] = useState(stage.objectives ?? "");
  const [daysDraft, setDaysDraft] = useState(
    stage.expectedDurationDays != null ? String(stage.expectedDurationDays) : "",
  );
  const [textDraft, setTextDraft] = useState(stage.expectedDurationText ?? "");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!stageSettingsOpen) return;
    setTitleDraft(stage.title);
    setDescriptionDraft(stage.description ?? "");
    setGoalsDraft(stage.goals ?? "");
    setObjectivesDraft(stage.objectives ?? "");
    setDaysDraft(stage.expectedDurationDays != null ? String(stage.expectedDurationDays) : "");
    setTextDraft(stage.expectedDurationText ?? "");
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
          setMsg(null);
          try {
            const res = await fetch(
              `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stageId)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
            );
            const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              setMsg(data.error ?? "Ошибка");
              return;
            }
            await onPatched();
            setMsg("Сохранено");
          } finally {
            setSaving(false);
          }
        });
      })();
    });
  };

  const stageActionsLocked = status === "completed" || status === "skipped" || editLocked;

  const submitSkip = async () => {
    if (editLocked) return;
    const reason = skipReasonDraft.trim();
    if (!reason) {
      setSkipDialogError("Укажите причину пропуска");
      return;
    }
    runOrPromptSave(() => {
      void (async () => {
        await runIfProgramInstanceMutationAllowed(programStatus, async () => {
          setSkipDialogError(null);
          setSaving(true);
          setMsg(null);
          try {
            const res = await fetch(
              `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stageId)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "skipped", reason }),
              },
            );
            const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              setSkipDialogError(data.error ?? "Ошибка");
              return;
            }
            await onPatched();
            setSkipDialogOpen(false);
            setSkipReasonDraft("");
            setMsg("Сохранено");
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
      setSettingsMsg("Укажите название этапа");
      return;
    }
    const daysTrim = daysDraft.trim();
    let expectedDurationDays: number | null = null;
    if (daysTrim !== "") {
      const n = Number.parseInt(daysTrim, 10);
      if (!Number.isFinite(n) || n < 0 || String(n) !== daysTrim) {
        setSettingsMsg("Срок в днях: неотрицательное целое число");
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
        {status === "locked" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving || editLocked}
            onClick={() => void patch({ status: "available" })}
          >
            Открыть этап
          </Button>
        ) : null}
        {status === "available" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving || editLocked}
            onClick={() => void patch({ status: "in_progress" })}
          >
            Старт этапа
          </Button>
        ) : null}
        {status === "completed" || status === "skipped" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || editLocked}
            onClick={() => void patch({ status: "in_progress" })}
          >
            Открыть заново
          </Button>
        ) : null}
        <div className="flex flex-nowrap items-center gap-2">
          {status === "available" || status === "in_progress" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving || stageActionsLocked}
              onClick={() => void patch({ status: "completed" })}
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
              setSkipReasonDraft("");
              setSkipDialogError(null);
              setSkipDialogOpen(true);
            }}
          >
            Пропустить этап
          </Button>
        </div>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
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
              Название, описание, цели и сроки этапа программы пациента. Значения скопированы из шаблона при назначении;
              изменения для этого пациента.
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
              <Label htmlFor={`st-goals-${stageId}`}>Цель этапа</Label>
              <Textarea
                id={`st-goals-${stageId}`}
                rows={3}
                className="text-sm"
                value={goalsDraft}
                onChange={(e) => setGoalsDraft(e.target.value)}
                disabled={editLocked}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`st-obj-${stageId}`}>Задачи этапа</Label>
              <Textarea
                id={`st-obj-${stageId}`}
                rows={3}
                className="text-sm"
                value={objectivesDraft}
                onChange={(e) => setObjectivesDraft(e.target.value)}
                disabled={editLocked}
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
          <DialogFooter>
            <Button type="button" variant="outline" disabled={editLocked} onClick={() => setStageSettingsOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={editLocked || !titleDraft.trim()} onClick={() => saveStageSettings()}>
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
            setSkipReasonDraft("");
            setSkipDialogError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Пропустить этап</DialogTitle>
            <DialogDescription>Этап будет отмечен как пропущенный; укажите причину для журнала.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`skip-reason-${stageId}`}>
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
          <DialogFooter>
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
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void submitSkip()}>
              {saving ? "Сохранение…" : "Пропустить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {unsavedDialog}
    </div>
  );
}

function ItemLocalCommentForm(props: {
  itemId: string;
  initialDraft: string;
  placeholder?: string;
  editLocked: boolean;
}) {
  const { itemId, initialDraft, placeholder, editLocked } = props;
  const { patchItemLocalComment } = useInstanceEditorDraft();
  const [draft, setDraft] = useState(initialDraft);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset comment draft when itemId/initialDraft changes
    setDraft(initialDraft);
  }, [itemId, initialDraft]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`lc-${itemId}`}>
        Индивидуальный комментарий
      </label>
      <Textarea
        id={`lc-${itemId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (editLocked) return;
          patchItemLocalComment(itemId, draft.trim() === "" ? null : draft.trim());
        }}
        rows={3}
        className="text-sm"
        disabled={editLocked}
        placeholder={placeholder ?? "Из шаблона: —"}
      />
    </div>
  );
}
