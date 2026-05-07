"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
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

/** B7 FIX: комментарии строк набора из снимка `test_set` (каталог). */
function TestSetCatalogSnapshotLines({ snapshot }: { snapshot: Record<string, unknown> }) {
  const lines = parseTestSetSnapshotTests(snapshot);
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-border/50 bg-muted/10 p-2">
      <p className="text-xs font-medium text-muted-foreground">Набор тестов (каталог)</p>
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

function DoctorProgramInstanceItemCard(props: {
  instanceId: string;
  stage: InstanceStageT;
  item: InstanceStageItemT;
  testResults: TreatmentProgramTestResultDetailRow[];
  onSaved: () => Promise<void>;
  /** Левая колонка «Рекомендации (этап 0)»: без суффикса типа и без выбора группы. */
  phaseZeroRecommendation?: boolean;
}) {
  const { instanceId, stage, item, testResults, onSaved, phaseZeroRecommendation = false } = props;
  const recPhase0 = phaseZeroRecommendation && item.itemType === "recommendation";
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <p className="text-sm font-medium">
        {snapshotTitle(item.snapshot, item.itemType)}{" "}
        {recPhase0 ? null : (
          <span className="font-normal text-muted-foreground">({item.itemType})</span>
        )}
      </p>
      {item.itemType === "test_set" ? <TestSetCatalogSnapshotLines snapshot={item.snapshot} /> : null}
      <ItemLocalCommentForm
        key={`${item.id}:${item.localComment ?? ""}`}
        instanceId={instanceId}
        itemId={item.id}
        initialDraft={item.localComment ?? ""}
        placeholder={item.comment?.trim() ? `Из шаблона: ${item.comment.trim()}` : "Из шаблона: —"}
        onSaved={onSaved}
      />
      <InstanceStageItemDoctorRow
        instanceId={instanceId}
        item={item}
        groups={stage.groups}
        testResults={testResults}
        onSaved={onSaved}
        hideGroupSelect={recPhase0}
      />
    </div>
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
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            У пациента программа будет отмечена как завершённая. После этого при необходимости можно назначить новую
            активную программу.
          </p>
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

export function TreatmentProgramInstanceDetailClient(props: {
  patientDisplayName: string;
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  initialEvents: TreatmentProgramEventRow[];
  initialActionLog: ProgramActionLogListRow[];
  currentUserId: string;
  isAdmin?: boolean;
  appDisplayTimeZone: string;
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
  } = props;
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TreatmentProgramTestResultDetailRow[]>(initialTestResults);
  const [programEvents, setProgramEvents] = useState<TreatmentProgramEventRow[]>(initialEvents);
  const [actionLog, setActionLog] = useState<ProgramActionLogListRow[]>(initialActionLog);

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

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
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
            title="Комментарии к программе"
          />

          <section
            className="rounded-xl border border-border bg-card p-4"
            id="doctor-program-instance-phase0-recommendations"
          >
            <h3 className="text-base font-semibold">Рекомендации (этап 0)</h3>
            {!stageZero ? (
              <p className="mt-3 text-sm text-muted-foreground">В программе нет этапа с номером 0.</p>
            ) : phaseZeroRecommendations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Нет рекомендаций на этапе 0.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-4">
                {phaseZeroRecommendations.map((item) => (
                  <DoctorProgramInstanceItemCard
                    key={item.id}
                    instanceId={detail.id}
                    stage={stageZero}
                    item={item}
                    testResults={testResults}
                    onSaved={refresh}
                    phaseZeroRecommendation
                  />
                ))}
              </div>
            )}
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
                          onClick={async () => {
                            const res = await fetch(
                              `/api/doctor/treatment-program-instances/${encodeURIComponent(detail.id)}/test-results/${encodeURIComponent(r.id)}`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ normalizedDecision: d }),
                              },
                            );
                            if (res.ok) void refreshResults();
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
            .map((stage) => {
            return (
              <section key={stage.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-semibold">{stage.title}</h3>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {formatTreatmentProgramStageStatusRu(stage.status)}
                  </span>
                  {stage.skipReason ? (
                    <span className="text-xs text-muted-foreground">Причина пропуска: {stage.skipReason}</span>
                  ) : null}
                </div>
                <StageDoctorControls instanceId={detail.id} stage={stage} onPatched={refresh} />
                <InstanceStageGroupsPanel
                  instanceId={detail.id}
                  stage={stage}
                  onSaved={refresh}
                  testResults={testResults}
                />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InstanceStageGroupsPanel(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  onSaved: () => Promise<void>;
  testResults: TreatmentProgramTestResultDetailRow[];
}) {
  const { instanceId, stage, onSaved, testResults } = props;
  const [open, setOpen] = useState(false);
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

  const editingGroupMeta = groupEdit ? stage.groups.find((g) => g.id === groupEdit.id) : null;
  const editingIsSystem = editingGroupMeta ? isTreatmentProgramInstanceSystemStageGroup(editingGroupMeta) : false;

  const reorder = async (groupId: string, dir: -1 | 1) => {
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
  };

  const hideGroupFromModal = async () => {
    if (!groupEdit) return;
    if (
      !globalThis.confirm(
        "Элементы группы будут скрыты у пациента, сама группа удалена. Продолжить?",
      )
    )
      return;
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
    const t = title.trim();
    if (!t) return;
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
      setOpen(false);
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  const saveGroupEdit = async () => {
    if (!groupEdit) return;
    const gMeta = stage.groups.find((g) => g.id === groupEdit.id);
    const isSys = gMeta ? isTreatmentProgramInstanceSystemStageGroup(gMeta) : false;
    const t = groupEdit.title.trim();
    if (!isSys && !t) {
      setMsg("Название группы не может быть пустым");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = isSys
        ? {
            description: groupEdit.description.trim() || null,
            scheduleText: groupEdit.scheduleText.trim() || null,
          }
        : {
            title: t,
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
  };

  return (
    <div className="mb-4 rounded-lg border border-border/70 bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Группы внутри этапа</p>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
          + Группа
        </Button>
      </div>
      {hasUngrouped || hasGroups ? (
        <ul className="mt-2 list-none space-y-2 p-0">
          {hasUngrouped ? (
            <li key="__ungrouped__" className="rounded-md border border-border/60 bg-card/40 px-2 py-2 text-sm">
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex w-7 shrink-0 flex-col gap-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">Без группы</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{ungrouped.length}</span>
                  </div>
                  <ul className="m-0 mt-3 list-none space-y-3 border-t border-border/50 p-0 pt-3">
                    {ungrouped.map((item) => (
                      <li key={item.id} className="list-none">
                        <DoctorProgramInstanceItemCard
                          instanceId={instanceId}
                          stage={stage}
                          item={item}
                          testResults={testResults}
                          onSaved={onSaved}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ) : null}
          {sortedGroups.map((g) => {
            const isSys = isTreatmentProgramInstanceSystemStageGroup(g);
            const userIdx = userGroupsOrdered.findIndex((x) => x.id === g.id);
            return (
            <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-2 text-sm">
              <div className="flex shrink-0 flex-col gap-0.5">
                {isSys ? (
                  <div className="flex w-7 shrink-0 flex-col gap-0.5" aria-hidden />
                ) : (
                  <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={busy || userIdx <= 0}
                  aria-label="Группа выше"
                  onClick={() => void reorder(g.id, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={busy || userIdx < 0 || userIdx >= userGroupsOrdered.length - 1}
                  aria-label="Группа ниже"
                  onClick={() => void reorder(g.id, 1)}
                >
                  ↓
                </Button>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{g.title}</span>
                <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                  {stage.items.filter((it) => it.groupId === g.id).length}
                </span>
                {g.scheduleText?.trim() ? (
                  <span className="ml-2 text-xs text-muted-foreground">{g.scheduleText.trim()}</span>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
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
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Групп нет — элементы можно оставить вне групп.</p>
      )}
      {msg ? <p className="mt-2 text-xs text-destructive">{msg}</p> : null}
      <Dialog open={open} modal={false} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`ng-${stage.id}`}>Название</Label>
            <Input id={`ng-${stage.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={busy || !title.trim()} onClick={() => void addGroup()}>
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
              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Состав группы</p>
                {(() => {
                  const groupItems = sortByOrderThenId(
                    stage.items.filter((it) => it.groupId === groupEdit.id),
                  );
                  if (groupItems.length === 0) {
                    return <p className="mt-2 text-sm text-muted-foreground">Нет элементов в группе.</p>;
                  }
                  return (
                    <div className="mt-2 flex max-h-[min(50vh,28rem)] flex-col gap-3 overflow-y-auto pr-1">
                      {groupItems.map((item) => (
                        <DoctorProgramInstanceItemCard
                          key={item.id}
                          instanceId={instanceId}
                          stage={stage}
                          item={item}
                          testResults={testResults}
                          onSaved={onSaved}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setGroupEdit(null)}>
                Отмена
              </Button>
              {editingIsSystem ? null : (
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void hideGroupFromModal()}>
                Скрыть
              </Button>
              )}
              <Button
                type="button"
                disabled={busy || (!editingIsSystem && !groupEdit.title.trim())}
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
  /** Скрыть выбор группы (блок рекомендаций этапа 0). */
  hideGroupSelect?: boolean;
}) {
  const { instanceId, item, groups, testResults, onSaved, hideGroupSelect = false } = props;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  const patchItem = async (body: Record<string, unknown>) => {
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
  };

  return (
    <div className={cn("mt-3 flex flex-col gap-2", item.status === "disabled" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.status === "disabled" ? "secondary" : "default"}>
          {item.status === "disabled" ? "Отключено" : "Активно"}
        </Badge>
        {item.itemType === "recommendation" ? (
          <Select
            value={item.isActionable === false ? "persistent" : "actionable"}
            onValueChange={(v) => void patchItem({ isActionable: v === "actionable" })}
            disabled={saving}
            items={doctorRecommendationActionabilitySelectItems}
          >
            <SelectTrigger className="h-8 w-[220px] text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="actionable">Требует выполнения</SelectItem>
              <SelectItem value="persistent">Постоянная рекомендация</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        {!hideGroupSelect ? (
          <Select
            value={item.groupId ?? "__none__"}
            onValueChange={(v) => void patchItem({ groupId: v === "__none__" ? null : v })}
            disabled={saving}
            items={groupSelectItems}
          >
            <SelectTrigger className="h-8 w-[min(100%,12rem)] text-xs" size="sm">
              <SelectValue placeholder="Группа" />
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
        ) : null}
        {item.status === "active" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
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
            disabled={saving}
            onClick={() => void patchItem({ status: "active" })}
          >
            Включить
          </Button>
        )}
      </div>
      {msg ? <p className="text-xs text-destructive">{msg}</p> : null}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отключить элемент?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            У элемента уже есть выполнение или результат теста. Он будет скрыт у пациента, история сохранится.
          </p>
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
    </div>
  );
}

function StageDoctorControls(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  onPatched: () => Promise<void>;
}) {
  const { instanceId, stage, onPatched } = props;
  const stageId = stage.id;
  const status = stage.status;

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
  };

  const stageActionsLocked = status === "completed" || status === "skipped";

  const submitSkip = async () => {
    const reason = skipReasonDraft.trim();
    if (!reason) {
      setSkipDialogError("Укажите причину пропуска");
      return;
    }
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
  };

  const saveStageSettings = async () => {
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
  };

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-3">
      <p className="text-xs font-medium text-muted-foreground">Управление этапом (врач)</p>
      <div className="flex w-full flex-wrap items-center gap-2">
        {status === "locked" ? (
          <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void patch({ status: "available" })}>
            Открыть этап
          </Button>
        ) : null}
        {status === "available" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => void patch({ status: "in_progress" })}
          >
            Старт этапа
          </Button>
        ) : null}
        <div className="flex flex-nowrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || stageActionsLocked}
            onClick={() => void patch({ status: "completed" })}
          >
            Завершить этап
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving || settingsSaving}
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
}) {
  const { instanceId, itemId, initialDraft, placeholder, onSaved } = props;
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initialDraft);
  }, [itemId, initialDraft]);

  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`lc-${itemId}`}>
        Индивидуальный комментарий
      </label>
      <Textarea
        id={`lc-${itemId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        className="text-sm"
        disabled={saving}
        placeholder={placeholder ?? "Из шаблона: —"}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={async () => {
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
          }}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
