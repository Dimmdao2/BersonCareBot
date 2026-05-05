"use client";

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
  effectiveInstanceStageItemComment,
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramEventTypeRu,
  formatTreatmentProgramStageStatusRu,
  formatProgramActionLogSummaryRu,
  formatLfkPostSessionDifficultyRu,
} from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import { CommentBlock } from "@/components/comments/CommentBlock";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";

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

function InstanceStageMetadataForm(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  onSaved: () => Promise<void>;
}) {
  const { instanceId, stage, onSaved } = props;
  const [goalsDraft, setGoalsDraft] = useState(stage.goals ?? "");
  const [objectivesDraft, setObjectivesDraft] = useState(stage.objectives ?? "");
  const [daysDraft, setDaysDraft] = useState(
    stage.expectedDurationDays != null ? String(stage.expectedDurationDays) : "",
  );
  const [textDraft, setTextDraft] = useState(stage.expectedDurationText ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setGoalsDraft(stage.goals ?? "");
    setObjectivesDraft(stage.objectives ?? "");
    setDaysDraft(stage.expectedDurationDays != null ? String(stage.expectedDurationDays) : "");
    setTextDraft(stage.expectedDurationText ?? "");
    setMsg(null);
  }, [
    stage.id,
    stage.goals,
    stage.objectives,
    stage.expectedDurationDays,
    stage.expectedDurationText,
  ]);

  const save = async () => {
    const daysTrim = daysDraft.trim();
    let expectedDurationDays: number | null = null;
    if (daysTrim !== "") {
      const n = Number.parseInt(daysTrim, 10);
      if (!Number.isFinite(n) || n < 0 || String(n) !== daysTrim) {
        setMsg("Срок в днях: неотрицательное целое число");
        return;
      }
      expectedDurationDays = n;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(stage.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goals: goalsDraft.trim() || null,
            objectives: objectivesDraft.trim() || null,
            expectedDurationDays,
            expectedDurationText: textDraft.trim() || null,
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(data.error ?? "Ошибка");
        return;
      }
      await onSaved();
      setMsg("Сохранено");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`inst-goals-${stage.id}`}>Цель этапа</Label>
          <Textarea
            id={`inst-goals-${stage.id}`}
            rows={3}
            className="text-sm"
            value={goalsDraft}
            onChange={(e) => setGoalsDraft(e.target.value)}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">Markdown; для пациента в шапке этапа.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`inst-obj-${stage.id}`}>Задачи этапа</Label>
          <Textarea
            id={`inst-obj-${stage.id}`}
            rows={3}
            className="text-sm"
            value={objectivesDraft}
            onChange={(e) => setObjectivesDraft(e.target.value)}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">Только текст/markdown (O1), не чеклист в БД.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`inst-days-${stage.id}`}>Ожидаемый срок, дней</Label>
          <Input
            id={`inst-days-${stage.id}`}
            className="max-w-[12rem] text-sm"
            inputMode="numeric"
            value={daysDraft}
            onChange={(e) => setDaysDraft(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`inst-dur-${stage.id}`}>Ожидаемый срок, текстом</Label>
          <Input
            id={`inst-dur-${stage.id}`}
            className="text-sm"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? "Сохранение…" : "Сохранить цели этапа"}
          </Button>
          {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function TreatmentProgramInstanceDetailClient(props: {
  patientUserId: string;
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  initialEvents: TreatmentProgramEventRow[];
  initialActionLog: ProgramActionLogListRow[];
  currentUserId: string;
  isAdmin?: boolean;
}) {
  const { patientUserId, initial, initialTestResults, initialEvents, initialActionLog, currentUserId, isAdmin = false } =
    props;
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TreatmentProgramTestResultDetailRow[]>(initialTestResults);
  const [programEvents, setProgramEvents] = useState<TreatmentProgramEventRow[]>(initialEvents);
  const [actionLog, setActionLog] = useState<ProgramActionLogListRow[]>(initialActionLog);

  const itemTitles = useMemo(() => itemTitleById(detail), [detail]);

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
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-base font-semibold">Дневник занятий</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Журнал действий пациента по программе (<span className="font-mono">program_action_log</span>): ЛФК с
          оценкой нагрузки, отметки чек-листа, маркеры отправки тестов. Сначала новые записи (до 200).
        </p>
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
                    {new Date(row.createdAt).toLocaleString("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
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

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-base font-semibold">История изменений программы</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          События по §8 SYSTEM_LOGIC_SCHEMA: мутации структуры, статусы этапов, комментарии, тесты. Порядок:{" "}
          <span className="font-medium text-foreground/80">от старых к новым</span> (до последних 200 записей).
        </p>
        {programEvents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Пока нет записанных событий.</p>
        ) : (
          <ul className="mt-3 max-h-80 list-none space-y-2 overflow-y-auto pl-0 text-sm">
            {programEvents.map((e) => (
              <li key={e.id} className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                <span className="ml-2 font-medium">{formatTreatmentProgramEventTypeRu(e.eventType)}</span>
                <span className="ml-1 text-xs text-muted-foreground">
                  ({e.targetType} · <span className="font-mono">{e.targetId.slice(0, 8)}…</span>)
                </span>
                {e.reason ? (
                  <span className="mt-0.5 block text-xs text-foreground/90">Причина: {e.reason}</span>
                ) : null}
                {e.actorId ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Актор: <span className="font-mono">{e.actorId.slice(0, 8)}…</span>
                  </span>
                ) : (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">Актор: система</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold tracking-tight">{detail.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Пациент:{" "}
          <span className="font-mono text-[11px] text-foreground" translate="no">
            {patientUserId}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Статус программы: {detail.status === "completed" ? "завершена" : "активна"}
        </p>
        <ProgramInstanceCompleteControl instanceId={detail.id} status={detail.status} onPatched={refresh} />
      </div>

      {testResults.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4">
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

      {detail.stages.map((stage) => (
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
          <StageDoctorControls
            instanceId={detail.id}
            stageId={stage.id}
            status={stage.status}
            onPatched={refresh}
          />
          <div className="mb-4">
            <InstanceStageMetadataForm instanceId={detail.id} stage={stage} onSaved={refresh} />
          </div>
          <InstanceStageGroupsPanel instanceId={detail.id} stage={stage} onSaved={refresh} />
          <div className="space-y-4">
            {sortByOrderThenId(stage.groups).map((g) => {
              const gItems = sortByOrderThenId(stage.items.filter((it) => it.groupId === g.id));
              if (gItems.length === 0) return null;
              return (
                <div key={g.id} className="rounded-lg border border-border/70 bg-muted/10 p-3">
                  <p className="text-sm font-semibold">{g.title}</p>
                  {g.scheduleText?.trim() ? (
                    <p className="text-xs text-muted-foreground">{g.scheduleText.trim()}</p>
                  ) : null}
                  <ul className="m-0 mt-3 list-none space-y-4 p-0">
                    {gItems.map((item) => (
                      <li key={item.id} className="rounded-lg border border-border/80 bg-muted/20 p-3">
                        <p className="text-sm font-medium">
                          {snapshotTitle(item.snapshot, item.itemType)}{" "}
                          <span className="font-normal text-muted-foreground">({item.itemType})</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Комментарий для пациента:{" "}
                          <span className="text-foreground">
                            {effectiveInstanceStageItemComment(item) ?? "—"}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Из шаблона (заморожено): {item.comment?.trim() ? item.comment : "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Выполнение элемента:{" "}
                          {item.completedAt ? (
                            <span className="text-foreground">да ({item.completedAt})</span>
                          ) : (
                            <span>нет</span>
                          )}
                        </p>
                        {item.itemType === "test_set" ? (
                          <TestSetCatalogSnapshotLines snapshot={item.snapshot} />
                        ) : null}
                        <ItemLocalCommentForm
                          key={`${item.id}:${item.localComment ?? ""}`}
                          instanceId={detail.id}
                          itemId={item.id}
                          initialDraft={item.localComment ?? ""}
                          placeholder={
                            item.comment?.trim()
                              ? `Из шаблона: ${item.comment.trim()}`
                              : "Из шаблона: —"
                          }
                          onSaved={refresh}
                        />
                        <InstanceStageItemDoctorRow
                          instanceId={detail.id}
                          item={item}
                          groups={stage.groups}
                          testResults={testResults}
                          onSaved={refresh}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {(() => {
              const ungrouped = sortByOrderThenId(stage.items.filter((it) => !it.groupId));
              if (ungrouped.length === 0) return null;
              return (
                <div>
                  {stage.groups.length > 0 ? (
                    <p className="mb-2 text-sm font-medium text-muted-foreground">Без группы</p>
                  ) : null}
                  <ul className="m-0 list-none space-y-4 p-0">
                    {ungrouped.map((item) => (
                      <li key={item.id} className="rounded-lg border border-border/80 bg-muted/20 p-3">
                        <p className="text-sm font-medium">
                          {snapshotTitle(item.snapshot, item.itemType)}{" "}
                          <span className="font-normal text-muted-foreground">({item.itemType})</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Комментарий для пациента:{" "}
                          <span className="text-foreground">
                            {effectiveInstanceStageItemComment(item) ?? "—"}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Из шаблона (заморожено): {item.comment?.trim() ? item.comment : "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Выполнение элемента:{" "}
                          {item.completedAt ? (
                            <span className="text-foreground">да ({item.completedAt})</span>
                          ) : (
                            <span>нет</span>
                          )}
                        </p>
                        {item.itemType === "test_set" ? (
                          <TestSetCatalogSnapshotLines snapshot={item.snapshot} />
                        ) : null}
                        <ItemLocalCommentForm
                          key={`${item.id}:${item.localComment ?? ""}`}
                          instanceId={detail.id}
                          itemId={item.id}
                          initialDraft={item.localComment ?? ""}
                          placeholder={
                            item.comment?.trim()
                              ? `Из шаблона: ${item.comment.trim()}`
                              : "Из шаблона: —"
                          }
                          onSaved={refresh}
                        />
                        <InstanceStageItemDoctorRow
                          instanceId={detail.id}
                          item={item}
                          groups={stage.groups}
                          testResults={testResults}
                          onSaved={refresh}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        </section>
      ))}

      <CommentBlock
        targetType="program_instance"
        targetId={detail.id}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        title="Комментарии к программе"
      />
    </div>
  );
}

function InstanceStageGroupsPanel(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  onSaved: () => Promise<void>;
}) {
  const { instanceId, stage, onSaved } = props;
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
  const sortedGroups = sortByOrderThenId(stage.groups);

  const reorder = async (groupId: string, dir: -1 | 1) => {
    const idx = sortedGroups.findIndex((g) => g.id === groupId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sortedGroups.length) return;
    const newOrder = sortedGroups.map((g) => g.id);
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

  const removeGroup = async (groupId: string) => {
    if (!globalThis.confirm("Удалить группу? Элементы останутся без группы.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-groups/${encodeURIComponent(groupId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(data.error ?? "Ошибка");
        return;
      }
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
    const t = groupEdit.title.trim();
    if (!t) {
      setMsg("Название группы не может быть пустым");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-groups/${encodeURIComponent(groupEdit.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: t,
            description: groupEdit.description.trim() || null,
            scheduleText: groupEdit.scheduleText.trim() || null,
          }),
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
      {sortedGroups.length > 0 ? (
        <ul className="mt-2 list-none space-y-2 p-0">
          {sortedGroups.map((g, gi) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-2 text-sm">
              <div className="flex shrink-0 flex-col gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={busy || gi === 0}
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
                  disabled={busy || gi >= sortedGroups.length - 1}
                  aria-label="Группа ниже"
                  onClick={() => void reorder(g.id, 1)}
                >
                  ↓
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{g.title}</span>
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
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void removeGroup(g.id)}>
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Групп нет — элементы можно оставить вне групп.</p>
      )}
      {msg ? <p className="mt-2 text-xs text-destructive">{msg}</p> : null}
      <Dialog open={open} onOpenChange={setOpen}>
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

      <Dialog
        open={groupEdit !== null}
        onOpenChange={(v) => {
          if (!v) setGroupEdit(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Группа этапа</DialogTitle>
          </DialogHeader>
          {groupEdit ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`eg-title-${groupEdit.id}`}>Название</Label>
                <Input
                  id={`eg-title-${groupEdit.id}`}
                  value={groupEdit.title}
                  onChange={(e) => setGroupEdit((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  maxLength={2000}
                  disabled={busy}
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
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setGroupEdit(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={busy || !groupEdit?.title.trim()}
              onClick={() => void saveGroupEdit()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InstanceStageItemDoctorRow(props: {
  instanceId: string;
  item: TreatmentProgramInstanceDetail["stages"][number]["items"][number];
  groups: TreatmentProgramInstanceDetail["stages"][number]["groups"];
  testResults: TreatmentProgramTestResultDetailRow[];
  onSaved: () => Promise<void>;
}) {
  const { instanceId, item, groups, testResults, onSaved } = props;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasHistory = Boolean(item.completedAt) || testResults.some((r) => r.instanceStageItemId === item.id);

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
        <Select
          value={item.groupId ?? "__none__"}
          onValueChange={(v) => void patchItem({ groupId: v === "__none__" ? null : v })}
          disabled={saving}
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
      <p className="text-xs text-muted-foreground">
        Отключённый элемент скрывается у пациента; запись в базе сохраняется (без DELETE).
      </p>
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
  stageId: string;
  status: string;
  onPatched: () => Promise<void>;
}) {
  const { instanceId, stageId, status, onPatched } = props;
  const [skipReason, setSkipReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-3">
      <p className="text-xs font-medium text-muted-foreground">Управление этапом (врач)</p>
      <div className="flex flex-wrap gap-2">
        {status === "locked" ? (
          <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => patch({ status: "available" })}>
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving || status === "completed" || status === "skipped"}
          onClick={() => patch({ status: "completed" })}
        >
          Завершить этап
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`skip-${stageId}`}>
          Пропуск этапа (обязательна причина)
        </label>
        <Textarea
          id={`skip-${stageId}`}
          rows={2}
          className="text-sm"
          value={skipReason}
          onChange={(e) => setSkipReason(e.target.value)}
          disabled={saving || status === "skipped"}
        />
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={saving || status === "skipped"}
          onClick={() => patch({ status: "skipped", reason: skipReason.trim() || undefined })}
        >
          Пропустить этап
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
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
        Индивидуальный комментарий (override)
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={async () => {
            setDraft("");
            setSaving(true);
            setMsg(null);
            try {
              const res = await fetch(
                `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-items/${encodeURIComponent(itemId)}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ localComment: null }),
                },
              );
              const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
              if (!res.ok || !data.ok) {
                setMsg(data.error ?? "Ошибка");
                return;
              }
              await onSaved();
              setMsg("Сброшено к шаблону");
            } catch {
              setMsg("Ошибка");
            } finally {
              setSaving(false);
            }
          }}
        >
          Сбросить override
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
