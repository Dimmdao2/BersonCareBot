"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, ClipboardList, Layers, MessageSquare } from "lucide-react";
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
  INSTANCE_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS,
  INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS,
  INSTANCE_HEADER_BG_STAGE_EDITABLE,
  TPL_HEADER_BG_RECOMMENDATIONS,
  instanceGroupHeaderSurfaceStyle,
  tplToolbarTextBtnClass,
} from "@/app/app/doctor/treatment-program-shared/treatmentProgramConstructorShellStyles";
import { TemplateReorderChevrons } from "@/shared/ui/doctor/TemplateReorderChevrons";
import {
  InstanceAddLibraryItemDialog,
  TreatmentProgramAddItemSquareButton,
  type InstanceAddLibraryItemSpec,
} from "@/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog";
import type { TreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { primaryMediaForStageItem } from "@/app/app/patient/treatment/stageItemSnapshot";
import { listLfkSnapshotExerciseLines } from "@/modules/treatment-program/programActionActivityKey";

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

function doctorTimelineWhoRu(actorId: string | null, opts: { currentUserId: string; patientUserId: string }): string | null {
  if (!actorId) return null;
  if (actorId === opts.currentUserId) return "Вы";
  if (actorId === opts.patientUserId) return "Пациент";
  return "Врач";
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

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

type InstanceStageT = TreatmentProgramInstanceDetail["stages"][number];
type InstanceStageItemT = InstanceStageT["items"][number];

function sameInstanceItemGroupKey(
  item: { groupId: string | null | undefined },
  groupId: string | null,
): boolean {
  return (item.groupId ?? null) === (groupId ?? null);
}

/**
 * Полный список id элементов этапа после перестановки соседей внутри одной группы
 * (`groupId === null` — только элементы без группы). Опционально **`itemInReorderBand`** —
 * подмножество внутри группы (например только `recommendation` на этапе 0).
 */
function computeOrderedItemIdsAfterGroupItemAdjacentSwap(
  stage: TreatmentProgramInstanceDetail["stages"][number],
  groupId: string | null,
  itemId: string,
  dir: -1 | 1,
  opts?: { itemInReorderBand?: (it: InstanceStageItemT) => boolean },
): string[] | null {
  const inBand = opts?.itemInReorderBand ?? (() => true);
  const groupItems = sortByOrderThenId(
    stage.items.filter((it) => sameInstanceItemGroupKey(it, groupId) && inBand(it)),
  );
  const idx = groupItems.findIndex((it) => it.id === itemId);
  if (idx < 0) return null;
  const j = idx + dir;
  if (j < 0 || j >= groupItems.length) return null;
  const nextGroupOrder = [...groupItems];
  const a = nextGroupOrder[idx]!;
  const b = nextGroupOrder[j]!;
  nextGroupOrder[idx] = b;
  nextGroupOrder[j] = a;
  const queue = nextGroupOrder.map((it) => it.id);
  const allSorted = sortByOrderThenId(stage.items);
  const out: string[] = [];
  for (const it of allSorted) {
    if (sameInstanceItemGroupKey(it, groupId) && inBand(it)) {
      const nextId = queue.shift();
      if (!nextId) return null;
      out.push(nextId);
    } else {
      out.push(it.id);
    }
  }
  if (queue.length !== 0) return null;
  return out;
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
  if (itemType === "lfk_complex") {
    const lines = listLfkSnapshotExerciseLines(snapshot);
    const L = lines[0];
    return {
      reps: pickFirstFiniteNum(ov.reps, L?.reps),
      sets: pickFirstFiniteNum(ov.sets, L?.sets),
      maxPain: pickFirstFiniteNum(ov.maxPain, L?.maxPain),
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
      ) : item.itemType === "lfk_complex" ? (
        <Layers className="size-7 text-muted-foreground" aria-hidden />
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

function DoctorInstanceStageItemLoadForm(props: {
  instanceId: string;
  item: InstanceStageItemT;
  programStatus: TreatmentProgramInstanceStatus;
  editLocked: boolean;
  onSaved: () => Promise<void>;
}) {
  const { instanceId, item, programStatus, editLocked, onSaved } = props;
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState("");
  const [maxPain, setMaxPain] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const e = effectiveLoadTripleFromParts(item.itemType, item.settings, item.snapshot);
    setReps(e.reps != null ? String(e.reps) : "");
    setSets(e.sets != null ? String(e.sets) : "");
    setMaxPain(e.maxPain != null ? String(e.maxPain) : "");
    setMsg(null);
  }, [item.id, item.itemType, item.settings, item.snapshot]);

  const save = async () => {
    if (editLocked) return;
    const parseField = (raw: string, label: string): number | null => {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number.parseInt(t, 10);
      if (!Number.isFinite(n) || String(n) !== t.trim()) {
        throw new Error(`${label}: целое число или пусто`);
      }
      return n;
    };

    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setSaving(true);
      setMsg(null);
      try {
        let repsV: number | null;
        let setsV: number | null;
        let maxPV: number | null;
        try {
          repsV = parseField(reps, "Повторы");
          setsV = parseField(sets, "Подходы");
          maxPV = parseField(maxPain, "Макс. боль");
        } catch (err) {
          setMsg(err instanceof Error ? err.message : "Ошибка");
          return;
        }

        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-items/${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              loadSettings: {
                reps: repsV,
                sets: setsV,
                maxPain: maxPV,
              },
            }),
          },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setMsg(data.error ?? "Ошибка сохранения");
          return;
        }
        await onSaved();
        setMsg("Сохранено");
      } finally {
        setSaving(false);
      }
    });
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
            disabled={saving || editLocked}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
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
            disabled={saving || editLocked}
            value={sets}
            onChange={(e) => setSets(e.target.value)}
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
            disabled={saving || editLocked}
            value={maxPain}
            onChange={(e) => setMaxPain(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={saving || editLocked} onClick={() => void save()}>
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

function DoctorProgramInstanceItemCard(props: {
  instanceId: string;
  stage: InstanceStageT;
  item: InstanceStageItemT;
  testResults: TreatmentProgramTestResultDetailRow[];
  onSaved: () => Promise<void>;
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
}) {
  const {
    instanceId,
    stage,
    item,
    testResults,
    onSaved,
    programStatus,
    phaseZeroRecommendation = false,
    reorderInGroup,
  } = props;
  const recPhase0 = phaseZeroRecommendation && item.itemType === "recommendation";
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const hasLocalCommentOverride = Boolean(item.localComment?.trim());
  return (
    <details className="group rounded-lg border border-border/80 bg-muted/20 open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
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
              instanceId={instanceId}
              item={item}
              programStatus={programStatus}
              editLocked={editLocked}
              groups={stage.groups}
              testResults={testResults}
              onSaved={onSaved}
              hideGroupSelect={recPhase0}
            />
            {item.itemType === "exercise" || item.itemType === "lfk_complex" ? (
              <DoctorInstanceStageItemLoadForm
                instanceId={instanceId}
                item={item}
                programStatus={programStatus}
                editLocked={editLocked}
                onSaved={onSaved}
              />
            ) : null}
            {item.itemType === "clinical_test" ? <ClinicalTestCatalogSnapshotLines snapshot={item.snapshot} /> : null}
            <ItemLocalCommentForm
              key={`${item.id}:${item.localComment ?? ""}`}
              instanceId={instanceId}
              itemId={item.id}
              programStatus={programStatus}
              editLocked={editLocked}
              initialDraft={item.localComment ?? ""}
              placeholder={item.comment?.trim() ? `Из шаблона: ${item.comment.trim()}` : "Из шаблона: —"}
              onSaved={onSaved}
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
        <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={() => setOpen(true)}>
          Завершить программу лечения
        </Button>
        {msg ? (
          <span className="text-xs text-destructive" role="alert">
            {msg}
          </span>
        ) : null}
      </div>
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
}) {
  const { instanceId, stage, programStatus, testResults, onSaved, onRequestAddLibraryItem } = props;
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const editLocked = isProgramInstanceEditLocked(programStatus);

  return (
    <section className={INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS}>
      <div
        className="border-b border-border/40 px-2 py-1.5"
        style={{ background: INSTANCE_HEADER_BG_STAGE_EDITABLE }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 pt-0.5">
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
          <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={tplToolbarTextBtnClass}
              disabled={editLocked}
              onClick={() => {
                if (editLocked) return;
                setNewGroupOpen(true);
              }}
            >
              + Группа
            </Button>
          </div>
        </div>
      </div>
      <div className="p-3">
        <StageDoctorControls instanceId={instanceId} stage={stage} programStatus={programStatus} onPatched={onSaved} />
        <InstanceStageGroupsPanel
          instanceId={instanceId}
          stage={stage}
          onSaved={onSaved}
          testResults={testResults}
          programStatus={programStatus}
          newGroupOpen={newGroupOpen}
          onNewGroupOpenChange={setNewGroupOpen}
          onRequestAddLibraryItem={onRequestAddLibraryItem}
        />
      </div>
    </section>
  );
}

export function TreatmentProgramInstanceDetailClient(props: {
  patientDisplayName: string;
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  initialEvents: TreatmentProgramEventRow[];
  initialActionLog: ProgramActionLogListRow[];
  currentUserId: string;
  isAdmin?: boolean;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
}) {
  const {
    patientDisplayName,
    initial,
    initialTestResults,
    initialEvents,
    initialActionLog,
    currentUserId,
    isAdmin = false,
    appDisplayTimeZone,
    treatmentProgramLibrary,
  } = props;
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TreatmentProgramTestResultDetailRow[]>(initialTestResults);
  const [programEvents, setProgramEvents] = useState<TreatmentProgramEventRow[]>(initialEvents);
  const [actionLog, setActionLog] = useState<ProgramActionLogListRow[]>(initialActionLog);
  const [addLibrarySpec, setAddLibrarySpec] = useState<InstanceAddLibraryItemSpec | null>(null);

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

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}`);
    const data = (await res.json().catch(() => null)) as { ok?: boolean; item?: TreatmentProgramInstanceDetail };
    if (!res.ok || !data.ok || !data.item) {
      setError("Не удалось обновить данные");
      return;
    }
    setDetail(data.item);
    const evRes = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/events`);
    const evData = (await evRes.json().catch(() => null)) as { ok?: boolean; events?: TreatmentProgramEventRow[] };
    if (evRes.ok && evData.ok && evData.events) setProgramEvents(evData.events);
    const alRes = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/action-log`);
    const alData = (await alRes.json().catch(() => null)) as {
      ok?: boolean;
      entries?: ProgramActionLogListRow[];
    };
    if (alRes.ok && alData.ok && alData.entries) setActionLog(alData.entries);
  }, [detail.id]);

  const refreshResults = useCallback(async () => {
    const res = await fetch(`/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-results`);
    const data = (await res.json().catch(() => null)) as { ok?: boolean; results?: TreatmentProgramTestResultDetailRow[] };
    if (res.ok && data.ok && data.results) setTestResults(data.results);
  }, [detail.id]);

  const reorderPhaseZeroItem = useCallback(
    async (itemId: string, dir: -1 | 1) => {
      if (!stageZero) return;
      const ordered = computeOrderedItemIdsAfterGroupItemAdjacentSwap(stageZero, null, itemId, dir, {
        itemInReorderBand: (it) => it.itemType === "recommendation",
      });
      if (!ordered) return;
      await runIfProgramInstanceMutationAllowed(detail.status, async () => {
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/stages/${encodeURIComponent(stageZero.id)}/items/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedItemIds: ordered }),
          },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Не удалось изменить порядок");
          return;
        }
        await refresh();
      });
    },
    [detail.id, detail.status, stageZero, refresh],
  );

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4" id="doctor-program-instance-left">
          <section className="rounded-xl border border-border bg-card p-4" id="doctor-program-instance-summary">
            <h2 className="text-lg font-semibold tracking-tight">{detail.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Пациент: <span className="font-medium text-foreground">{patientDisplayName}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Статус программы: {detail.status === "completed" ? "завершена" : "активна"}
            </p>
            <ProgramInstanceCompleteControl instanceId={detail.id} status={detail.status} onPatched={refresh} />
          </section>

          <CommentBlock
            targetType="program_instance"
            targetId={detail.id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            mutationsDisabled={detail.status === "completed"}
            title="Комментарии к программе"
          />

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
                    instanceId={detail.id}
                    stage={stageZero}
                    item={item}
                    testResults={testResults}
                    onSaved={refresh}
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
                  return (
                    <li key={row.id} className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
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
              <ul className="mt-3 space-y-2 text-sm">
                {testResults.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border/70 bg-muted/15 p-2">
                    <p className="font-medium">
                      {r.testTitle ?? r.testId}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({r.stageTitle}) · {formatNormalizedTestDecisionRu(r.normalizedDecision)} ({r.normalizedDecision})
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
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4" id="doctor-program-instance-right">
          {sortedStages
            .filter((s) => s.sortOrder > 0)
            .map((stage) => (
              <DoctorInstancePipelineStageBlock
                key={stage.id}
                instanceId={detail.id}
                stage={stage}
                programStatus={detail.status}
                testResults={testResults}
                onSaved={refresh}
                onRequestAddLibraryItem={(spec) => setAddLibrarySpec(spec)}
              />
            ))}
        </div>
      </div>
      <InstanceAddLibraryItemDialog
        open={addLibrarySpec !== null}
        onOpenChange={(o) => {
          if (!o) setAddLibrarySpec(null);
        }}
        instanceId={detail.id}
        spec={addLibrarySpec}
        library={treatmentProgramLibrary}
        programStatus={detail.status}
        editLocked={isProgramInstanceEditLocked(detail.status)}
        onAdded={refresh}
      />
    </div>
  );
}

function InstanceStageGroupsPanel(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  onSaved: () => Promise<void>;
  testResults: TreatmentProgramTestResultDetailRow[];
  programStatus: TreatmentProgramInstanceStatus;
  newGroupOpen: boolean;
  onNewGroupOpenChange: (open: boolean) => void;
  onRequestAddLibraryItem: (spec: InstanceAddLibraryItemSpec) => void;
}) {
  const { instanceId, stage, onSaved, testResults, programStatus, newGroupOpen, onNewGroupOpenChange, onRequestAddLibraryItem } =
    props;
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const [title, setTitle] = useState("");
  const [groupEdit, setGroupEdit] = useState<{
    id: string;
    title: string;
    description: string;
    scheduleText: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups);
  const userGroupsOrdered = sortedGroups.filter((g) => !g.systemKind);
  const ungrouped = sortByOrderThenId(stage.items.filter((it) => !it.groupId));
  const hasUngrouped = ungrouped.length > 0;
  const hasGroups = sortedGroups.length > 0;
  const isEmptyStage = !hasUngrouped && !hasGroups && stage.items.length === 0;

  const editingGroupMeta = groupEdit ? stage.groups.find((g) => g.id === groupEdit.id) : null;
  const editingIsSystem = editingGroupMeta ? isTreatmentProgramInstanceSystemStageGroup(editingGroupMeta) : false;

  const reorder = async (groupId: string, dir: -1 | 1) => {
    if (editLocked) return;
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      const idx = userGroupsOrdered.findIndex((g) => g.id === groupId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= userGroupsOrdered.length) return;
      const newOrder = userGroupsOrdered.map((g) => g.id);
      const a = newOrder[idx]!;
      const b = newOrder[j]!;
      newOrder[idx] = b;
      newOrder[j] = a;
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stage.id)}/groups/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedGroupIds: newOrder }),
          },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setMsg(data.error ?? "Ошибка порядка групп");
          return;
        }
        await onSaved();
      } finally {
        setBusy(false);
      }
    });
  };

  const reorderItemInStageGroup = async (groupId: string | null, itemId: string, dir: -1 | 1) => {
    if (editLocked) return;
    const ordered = computeOrderedItemIdsAfterGroupItemAdjacentSwap(stage, groupId, itemId, dir);
    if (!ordered) return;
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stage.id)}/items/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedItemIds: ordered }),
          },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setMsg(data.error ?? "Ошибка порядка элементов");
          return;
        }
        await onSaved();
      } finally {
        setBusy(false);
      }
    });
  };

  const hideGroupFromModal = async () => {
    if (!groupEdit) return;
    if (editLocked) return;
    const merged =
      programStatus === "active"
        ? "Применить к активной программе пациента? Элементы группы будут скрыты у пациента, группа удалена. Продолжить?"
        : "Элементы группы будут скрыты у пациента, сама группа удалена. Продолжить?";
    if (!globalThis.confirm(merged)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-groups/${encodeURIComponent(groupEdit.id)}/hide`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(data.error ?? "Ошибка");
        return;
      }
      setGroupEdit(null);
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  const addGroup = async () => {
    if (editLocked) return;
    const t = title.trim();
    if (!t) return;
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stage.id)}/groups`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: t }),
          },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setMsg(data.error ?? "Ошибка");
          return;
        }
        setTitle("");
        onNewGroupOpenChange(false);
        await onSaved();
      } finally {
        setBusy(false);
      }
    });
  };

  const saveGroupEdit = async () => {
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
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setBusy(true);
      setMsg(null);
      try {
        const body: Record<string, unknown> = isSysGroup
          ? {
              description: groupEdit.description.trim() || null,
              scheduleText: groupEdit.scheduleText.trim() || null,
            }
          : {
              title: groupEdit.title.trim(),
              description: groupEdit.description.trim() || null,
              scheduleText: groupEdit.scheduleText.trim() || null,
            };
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-groups/${encodeURIComponent(groupEdit.id)}`,
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
        setGroupEdit(null);
        await onSaved();
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="min-w-0">
      {isEmptyStage ? (
        <p className="text-sm text-muted-foreground">В этапе пока нет элементов и групп.</p>
      ) : (
        <div className="mt-1 space-y-3">
          {sortedGroups.map((g) => {
            const gItems = sortByOrderThenId(stage.items.filter((it) => it.groupId === g.id));
            const isSys = isTreatmentProgramInstanceSystemStageGroup(g);
            const userIdx = userGroupsOrdered.findIndex((x) => x.id === g.id);
            return (
              <div
                key={g.id}
                className="overflow-hidden rounded-md border border-border/50 bg-background/60 shadow-sm"
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
                      disabled={busy || editLocked}
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
                          disabled={busy || editLocked}
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
                          disabled={busy || editLocked}
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
                        disabled={busy || editLocked}
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
                    <ul className="divide-y rounded-md border border-border/30">
                      {gItems.map((item, idx) => (
                        <li key={item.id} className="list-none px-1 py-2">
                          <DoctorProgramInstanceItemCard
                            instanceId={instanceId}
                            stage={stage}
                            item={item}
                            testResults={testResults}
                            programStatus={programStatus}
                            onSaved={onSaved}
                            reorderInGroup={{
                              disableAll: busy || editLocked,
                              disableUp: idx <= 0,
                              disableDown: idx >= gItems.length - 1,
                              onMove: (dir) => void reorderItemInStageGroup(g.id, item.id, dir),
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
          {hasUngrouped ? (
            <div className="overflow-hidden rounded-md border-2 border-destructive bg-background/60">
              <div className="border-b border-destructive/50 bg-destructive/20 px-2 py-2 dark:bg-destructive/30">
                <p className="text-sm font-semibold text-foreground">Без группы</p>
              </div>
              <div className="p-2">
                <ul className="divide-y rounded-md border border-border/50">
                  {ungrouped.map((item, idx) => (
                    <li key={item.id} className="list-none px-1 py-2">
                      <DoctorProgramInstanceItemCard
                        instanceId={instanceId}
                        stage={stage}
                        item={item}
                        testResults={testResults}
                        programStatus={programStatus}
                        onSaved={onSaved}
                        reorderInGroup={{
                          disableAll: busy || editLocked,
                          disableUp: idx <= 0,
                          disableDown: idx >= ungrouped.length - 1,
                          onMove: (dir) => void reorderItemInStageGroup(null, item.id, dir),
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
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
              disabled={busy || editLocked || !title.trim()}
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
                  disabled={busy || editingIsSystem}
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
                  disabled={busy}
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
                  disabled={busy}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setGroupEdit(null)}>
                Отмена
              </Button>
              {editingIsSystem ? null : (
                <Button type="button" variant="destructive" disabled={busy || editLocked} onClick={() => void hideGroupFromModal()}>
                  Скрыть
                </Button>
              )}
              <Button
                type="button"
                disabled={busy || editLocked || (!editingIsSystem && !groupEdit.title.trim())}
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
  instanceId: string;
  item: TreatmentProgramInstanceDetail["stages"][number]["items"][number];
  groups: TreatmentProgramInstanceDetail["stages"][number]["groups"];
  testResults: TreatmentProgramTestResultDetailRow[];
  onSaved: () => Promise<void>;
  programStatus: TreatmentProgramInstanceStatus;
  editLocked: boolean;
  /** Скрыть выбор группы (блок рекомендаций этапа 0). */
  hideGroupSelect?: boolean;
}) {
  const { instanceId, item, groups, testResults, onSaved, programStatus, editLocked, hideGroupSelect = false } =
    props;
  const [saving, setSaving] = useState(false);
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

  const patchItem = async (body: Record<string, unknown>) => {
    if (editLocked) return;
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setSaving(true);
      setMsg(null);
      try {
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-items/${encodeURIComponent(item.id)}`,
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
        await onSaved();
      } finally {
        setSaving(false);
      }
    });
  };

  const deleteItem = async () => {
    if (editLocked) return;
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setSaving(true);
      setMsg(null);
      try {
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-items/${encodeURIComponent(item.id)}`,
          { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setMsg(data.error ?? "Ошибка удаления");
          return;
        }
        setDeleteConfirmOpen(false);
        await onSaved();
      } finally {
        setSaving(false);
      }
    });
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
            onValueChange={(v) => void patchItem({ isActionable: v === "actionable" })}
            disabled={saving || editLocked}
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
            onValueChange={(v) => void patchItem({ groupId: v === "__none__" ? null : v })}
            disabled={saving || editLocked}
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
            disabled={saving || editLocked}
            onClick={() => {
              if (hasHistory) setConfirmOpen(true);
              else void patchItem({ status: "disabled" });
            }}
          >
            Отключить
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={saving || editLocked}
            onClick={() => void patchItem({ status: "active" })}
          >
            Включить
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={saving || editLocked}
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
                void patchItem({ status: "disabled" });
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
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDeleteConfirmOpen(false)}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" disabled={saving || editLocked} onClick={() => void deleteItem()}>
              {saving ? "Удаление…" : "Удалить"}
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
  const [settingsSaving, setSettingsSaving] = useState(false);
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
  };

  const stageActionsLocked = status === "completed" || status === "skipped" || editLocked;

  const submitSkip = async () => {
    if (editLocked) return;
    const reason = skipReasonDraft.trim();
    if (!reason) {
      setSkipDialogError("Укажите причину пропуска");
      return;
    }
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
  };

  const saveStageSettings = async () => {
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
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setSettingsSaving(true);
      setSettingsMsg(null);
      try {
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: titleTrim,
              description: descriptionDraft.trim() || null,
              goals: goalsDraft.trim() || null,
              objectives: objectivesDraft.trim() || null,
              expectedDurationDays,
              expectedDurationText: textDraft.trim() || null,
            }),
          },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setSettingsMsg(data.error ?? "Ошибка");
          return;
        }
        setStageSettingsOpen(false);
        await onPatched();
      } finally {
        setSettingsSaving(false);
      }
    });
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
            disabled={saving || settingsSaving || editLocked}
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
                disabled={settingsSaving}
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
                disabled={settingsSaving}
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
                disabled={settingsSaving}
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
                disabled={settingsSaving}
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
                disabled={settingsSaving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`st-dur-${stageId}`}>Ожидаемый срок, текстом</Label>
              <Input
                id={`st-dur-${stageId}`}
                className="text-sm"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                disabled={settingsSaving}
              />
            </div>
            {settingsMsg ? <p className="text-xs text-destructive">{settingsMsg}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={settingsSaving} onClick={() => setStageSettingsOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={settingsSaving || !titleDraft.trim()} onClick={() => void saveStageSettings()}>
              {settingsSaving ? "Сохранение…" : "Сохранить настройки этапа"}
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
    </div>
  );
}

function ItemLocalCommentForm(props: {
  instanceId: string;
  itemId: string;
  initialDraft: string;
  placeholder?: string;
  onSaved: () => Promise<void>;
  programStatus: TreatmentProgramInstanceStatus;
  editLocked: boolean;
}) {
  const { instanceId, itemId, initialDraft, placeholder, onSaved, programStatus, editLocked } = props;
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
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
        rows={3}
        className="text-sm"
        disabled={saving || editLocked}
        placeholder={placeholder ?? "Из шаблона: —"}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving || editLocked}
          onClick={async () => {
            if (editLocked) return;
            await runIfProgramInstanceMutationAllowed(programStatus, async () => {
              setSaving(true);
              setMsg(null);
              try {
                const res = await fetch(
                  `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-items/${encodeURIComponent(itemId)}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ localComment: draft.trim() === "" ? null : draft.trim() }),
                  },
                );
                const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                if (!res.ok || !data.ok) {
                  setMsg(data.error ?? "Ошибка сохранения");
                  return;
                }
                await onSaved();
                setMsg("Сохранено");
              } catch {
                setMsg("Ошибка сохранения");
              } finally {
                setSaving(false);
              }
            });
          }}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
