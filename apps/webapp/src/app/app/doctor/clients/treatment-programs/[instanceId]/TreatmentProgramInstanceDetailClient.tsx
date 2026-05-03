"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { TreatmentProgramTestResultDetailRow } from "@/modules/treatment-program/types";
import type { TreatmentProgramEventRow } from "@/modules/treatment-program/types";
import {
  effectiveInstanceStageItemComment,
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramEventTypeRu,
  formatTreatmentProgramStageStatusRu,
} from "@/modules/treatment-program/types";
import { CommentBlock } from "@/components/comments/CommentBlock";

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
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
  currentUserId: string;
  isAdmin?: boolean;
}) {
  const { patientUserId, initial, initialTestResults, initialEvents, currentUserId, isAdmin = false } = props;
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TreatmentProgramTestResultDetailRow[]>(initialTestResults);
  const [programEvents, setProgramEvents] = useState<TreatmentProgramEventRow[]>(initialEvents);

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
          <ul className="m-0 list-none space-y-4 p-0">
            {stage.items.map((item) => (
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
                <ItemLocalCommentForm
                  key={`${item.id}:${item.localComment ?? ""}`}
                  instanceId={detail.id}
                  itemId={item.id}
                  initialDraft={item.effectiveComment ?? ""}
                  onSaved={refresh}
                />
              </li>
            ))}
          </ul>
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
  onSaved: () => Promise<void>;
}) {
  const { instanceId, itemId, initialDraft, onSaved } = props;
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
