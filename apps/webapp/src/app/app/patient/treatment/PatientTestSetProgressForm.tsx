"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { patientTestQualDecisionSelectItems } from "@/shared/ui/selectOpaqueValueLabels";
import type { PatientTestSetPageServerSnapshot } from "@/modules/treatment-program/progress-service";
import type {
  NormalizedTestDecision,
  TreatmentProgramTestResultDetailRow,
  TreatmentProgramTestResultRow,
} from "@/modules/treatment-program/types";
import { formatNormalizedTestDecisionRu } from "@/modules/treatment-program/types";
import { parseTestSetSnapshotTests, testIdsFromTestSetSnapshot } from "@/modules/treatment-program/testSetSnapshotView";
import { scoringAllowsNumericDecisionInference } from "@/modules/treatment-program/progress-scoring";
import { patientCompactActionClass, patientFormSurfaceClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

export type PatientTestSetProgressFormProps = {
  instanceId: string;
  itemId: string;
  snapshot: Record<string, unknown>;
  completed: boolean;
  /** Нет ввода: заблокированный этап, read-only навигация и т.п. */
  interactionDisabled: boolean;
  /** Данные с RSC: без начальных client fetch для попытки/результатов. */
  serverSnapshot?: PatientTestSetPageServerSnapshot | null;
  baseUrl: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  onDone: () => Promise<void>;
};

function latestResultsByTestId(rows: TreatmentProgramTestResultDetailRow[]): Map<string, TreatmentProgramTestResultDetailRow> {
  const m = new Map<string, TreatmentProgramTestResultDetailRow>();
  const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of sorted) {
    m.set(r.testId, r);
  }
  return m;
}

function augmentResultRowToDetail(
  r: TreatmentProgramTestResultRow,
  instanceStageItemId: string,
): TreatmentProgramTestResultDetailRow {
  return {
    ...r,
    instanceStageItemId,
    stageId: "",
    stageTitle: "",
    stageSortOrder: 0,
    testTitle: null,
  };
}

function buildFormStateFromInProgressRows(
  lines: ReturnType<typeof parseTestSetSnapshotTests>,
  rows: TreatmentProgramTestResultDetailRow[],
): {
  nextScores: Record<string, string>;
  nextNumericNotes: Record<string, string>;
  nextQualDecisions: Record<string, NormalizedTestDecision | "">;
  nextQualNotes: Record<string, string>;
  nextSaved: Record<string, TreatmentProgramTestResultDetailRow>;
} {
  const nextScores: Record<string, string> = {};
  const nextNumericNotes: Record<string, string> = {};
  const nextQualDecisions: Record<string, NormalizedTestDecision | ""> = {};
  const nextQualNotes: Record<string, string> = {};
  const nextSaved: Record<string, TreatmentProgramTestResultDetailRow> = {};

  for (const r of rows) {
    nextSaved[r.testId] = r;
    const rv = r.rawValue ?? {};
    if (typeof rv.score === "number" && Number.isFinite(rv.score)) {
      nextScores[r.testId] = String(rv.score);
    }
    if (typeof rv.note === "string" && rv.note.trim()) {
      const line = lines.find((x) => x.testId === r.testId);
      const auto = line ? scoringAllowsNumericDecisionInference(line.scoringConfig) : false;
      if (auto) {
        nextNumericNotes[r.testId] = rv.note;
      } else {
        nextQualNotes[r.testId] = rv.note;
      }
    }
    nextQualDecisions[r.testId] = r.normalizedDecision;
  }

  return { nextScores, nextNumericNotes, nextQualDecisions, nextQualNotes, nextSaved };
}

export function PatientTestSetProgressForm(props: PatientTestSetProgressFormProps) {
  const {
    instanceId,
    itemId,
    snapshot,
    completed,
    interactionDisabled,
    serverSnapshot = null,
    baseUrl,
    busy,
    setBusy,
    setError,
    onDone,
  } = props;

  const testIds = useMemo(() => testIdsFromTestSetSnapshot(snapshot), [snapshot]);
  const testsMeta = useMemo(() => parseTestSetSnapshotTests(snapshot), [snapshot]);

  const [scores, setScores] = useState<Record<string, string>>({});
  const [numericNotes, setNumericNotes] = useState<Record<string, string>>({});
  const [qualDecisions, setQualDecisions] = useState<Record<string, NormalizedTestDecision | "">>({});
  const [qualNotes, setQualNotes] = useState<Record<string, string>>({});
  const [errorByTestId, setErrorByTestId] = useState<Record<string, string>>({});
  const [hydratedAttemptId, setHydratedAttemptId] = useState<string | null>(null);
  const [savedByTestId, setSavedByTestId] = useState<Record<string, TreatmentProgramTestResultDetailRow>>({});
  const [completedSummaryLoaded, setCompletedSummaryLoaded] = useState(false);

  const ensureAttempt = useCallback(async () => {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-attempt`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      attempt?: { id: string };
    };
    if (!res.ok || !data.ok || !data.attempt?.id) {
      setError(data.error ?? "Не удалось начать попытку");
      return null;
    }
    return data.attempt.id;
  }, [baseUrl, itemId, setError]);

  const testIdsKey = testIds.join(",");

  useLayoutEffect(() => {
    setError(null);
    setErrorByTestId({});
    setHydratedAttemptId(null);
    setSavedByTestId({});
    setScores({});
    setNumericNotes({});
    setQualDecisions({});
    setQualNotes({});

    const snap = serverSnapshot ?? { variant: "none" as const };
    const lines = parseTestSetSnapshotTests(snapshot);

    if (snap.variant === "completed") {
      const nextSaved: Record<string, TreatmentProgramTestResultDetailRow> = {};
      for (const r of snap.latestByTest) {
        nextSaved[r.testId] = r;
      }
      setSavedByTestId(nextSaved);
      setCompletedSummaryLoaded(true);
      return;
    }

    if (interactionDisabled && !completed) {
      setCompletedSummaryLoaded(true);
      return;
    }

    if (snap.variant === "open_attempt") {
      const detailRows = snap.results.map((r) => augmentResultRowToDetail(r, itemId));
      const st = buildFormStateFromInProgressRows(lines, detailRows);
      setScores(st.nextScores);
      setNumericNotes(st.nextNumericNotes);
      setQualDecisions(st.nextQualDecisions);
      setQualNotes(st.nextQualNotes);
      setSavedByTestId(st.nextSaved);
      setHydratedAttemptId(snap.attemptId);
      setCompletedSummaryLoaded(true);
      return;
    }

    setCompletedSummaryLoaded(false);
  }, [serverSnapshot, itemId, snapshot, completed, interactionDisabled, setError]);

  useEffect(() => {
    const snap = serverSnapshot ?? { variant: "none" as const };
    if (snap.variant !== "none") return;

    let cancelled = false;

    async function hydrate() {
      setError(null);
      setErrorByTestId({});
      setHydratedAttemptId(null);
      setSavedByTestId({});
      setCompletedSummaryLoaded(false);
      const lines = parseTestSetSnapshotTests(snapshot);

      try {
        if (completed) {
          const res = await fetch(
            `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/test-results`,
          );
          const data = (await res.json().catch(() => null)) as {
            ok?: boolean;
            results?: TreatmentProgramTestResultDetailRow[];
          };
          if (cancelled) return;
          if (!res.ok || !data.ok || !Array.isArray(data.results)) {
            return;
          }
          const forItem = data.results.filter((r) => r.instanceStageItemId === itemId);
          const map = latestResultsByTestId(forItem);
          const nextSaved: Record<string, TreatmentProgramTestResultDetailRow> = {};
          for (const [tid, row] of map) {
            nextSaved[tid] = row;
          }
          if (!cancelled) setSavedByTestId(nextSaved);
          return;
        }

        if (interactionDisabled) {
          return;
        }

        const attemptId = await ensureAttempt();
        if (cancelled || !attemptId) {
          return;
        }
        if (!cancelled) setHydratedAttemptId(attemptId);

        const res = await fetch(
          `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/test-results`,
        );
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          results?: TreatmentProgramTestResultDetailRow[];
        };
        if (cancelled) return;
        if (!res.ok || !data.ok || !Array.isArray(data.results)) {
          return;
        }

        const forAttempt = data.results.filter(
          (r) => r.instanceStageItemId === itemId && r.attemptId === attemptId,
        );
        const st = buildFormStateFromInProgressRows(lines, forAttempt);
        if (!cancelled) {
          setScores(st.nextScores);
          setNumericNotes(st.nextNumericNotes);
          setQualDecisions(st.nextQualDecisions);
          setQualNotes(st.nextQualNotes);
          setSavedByTestId(st.nextSaved);
        }
      } finally {
        if (!cancelled) {
          setCompletedSummaryLoaded(true);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [
    instanceId,
    itemId,
    completed,
    interactionDisabled,
    testIdsKey,
    snapshot,
    ensureAttempt,
    setError,
    serverSnapshot,
  ]);

  const savedCount = useMemo(() => {
    const set = new Set<string>();
    for (const tid of testIds) {
      if (savedByTestId[tid]) set.add(tid);
    }
    return set.size;
  }, [savedByTestId, testIds]);

  if (completed) {
    if (!completedSummaryLoaded) {
      return (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Набор тестов пройден.</p>
        </div>
      );
    }
    const anyRow = testIds.some((tid) => Boolean(savedByTestId[tid]));
    return (
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-emerald-600 dark:text-emerald-400">Набор тестов пройден.</p>
        {anyRow ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {testsMeta.map((t) => {
              const row = savedByTestId[t.testId];
              if (!row) return null;
              return (
                <li
                  key={t.testId}
                  className="rounded-lg border border-[var(--patient-border)]/60 bg-[var(--patient-card-bg)] px-2 py-1.5"
                >
                  <span className="text-xs font-medium">{t.title ?? row.testTitle ?? t.testId}</span>
                  <p className={cn(patientMutedTextClass, "mt-1 mb-0 text-[11px]")}>
                    Итог: {formatNormalizedTestDecisionRu(row.normalizedDecision)}
                    {row.decidedBy ? " (уточнено врачом)" : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={cn(patientMutedTextClass, "text-xs")}>Детали результатов недоступны.</p>
        )}
      </div>
    );
  }

  if (interactionDisabled) {
    return (
      <p className={cn(patientMutedTextClass, "mt-2 text-xs")} role="status">
        Запись результатов недоступна.
      </p>
    );
  }

  if (!completedSummaryLoaded) {
    return (
      <div
        className={cn(patientFormSurfaceClass, "mt-3 border border-[var(--patient-border)]/70 p-3")}
        aria-busy="true"
      >
        <p className={cn(patientMutedTextClass, "m-0 text-xs")}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div
      className={cn(patientFormSurfaceClass, "mt-3 flex flex-col gap-3 border border-[var(--patient-border)]/70 p-3")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {testIds.length > 0 ? (
        <p className={cn(patientMutedTextClass, "m-0 text-[11px]")}>
          Сохранено тестов: {savedCount} / {testIds.length}
        </p>
      ) : null}

      {testsMeta.length === 0 ? (
        <p className="text-xs text-destructive">В снимке нет списка тестов.</p>
      ) : (
        testsMeta.map((t) => {
          const autoFromScore = scoringAllowsNumericDecisionInference(t.scoringConfig);
          const saved = savedByTestId[t.testId];
          const testErr = errorByTestId[t.testId];
          return (
            <div
              key={t.testId}
              className="flex flex-col gap-1 rounded-lg border border-[var(--patient-border)]/60 bg-[var(--patient-card-bg)] px-2 py-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium">{t.title ?? t.testId}</span>
                {saved ? (
                  <span className={cn(patientMutedTextClass, "text-[10px]")}>Сохранено</span>
                ) : null}
              </div>
              {t.comment ? (
                <p className={cn(patientMutedTextClass, "mt-0.5 text-[11px]")}>
                  Комментарий к позиции: <span className="text-foreground">{t.comment}</span>
                </p>
              ) : null}
              {testErr ? <p className="m-0 text-[11px] text-destructive">{testErr}</p> : null}
              {autoFromScore ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      className="h-8 max-w-[120px] text-sm"
                      placeholder="score"
                      value={scores[t.testId] ?? ""}
                      onChange={(e) => setScores((s) => ({ ...s, [t.testId]: e.target.value }))}
                      disabled={busy !== null}
                    />
                    <button
                      type="button"
                      className={cn(patientCompactActionClass, "h-8 w-auto text-sm")}
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy(itemId + t.testId);
                        setError(null);
                        setErrorByTestId((e) => ({ ...e, [t.testId]: "" }));
                        try {
                          let attemptId = hydratedAttemptId;
                          if (!attemptId) {
                            attemptId = await ensureAttempt();
                            if (!attemptId) return;
                            setHydratedAttemptId(attemptId);
                          }
                          const raw = scores[t.testId]?.trim();
                          const num = raw === "" || raw === undefined ? NaN : Number(raw);
                          const note = numericNotes[t.testId]?.trim() ?? "";
                          const body: Record<string, unknown> = {
                            testId: t.testId,
                            rawValue: Number.isFinite(num)
                              ? note
                                ? { score: num, note }
                                : { score: num }
                              : { value: raw ?? "" },
                          };
                          if (!Number.isFinite(num)) {
                            body.normalizedDecision = "partial";
                          }
                          const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-result`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                          });
                          const data = (await res.json().catch(() => null)) as {
                            ok?: boolean;
                            error?: string;
                            item?: unknown;
                          };
                          if (!res.ok || !data.ok) {
                            const msg = data.error ?? "Ошибка сохранения";
                            setErrorByTestId((e) => ({ ...e, [t.testId]: msg }));
                            return;
                          }
                          await onDone();
                          const jsonRes = await fetch(
                            `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/test-results`,
                          );
                          const jsonData = (await jsonRes.json().catch(() => null)) as {
                            results?: TreatmentProgramTestResultDetailRow[];
                          };
                          if (jsonRes.ok && Array.isArray(jsonData.results) && attemptId) {
                            const row = jsonData.results.find(
                              (r) =>
                                r.instanceStageItemId === itemId &&
                                r.attemptId === attemptId &&
                                r.testId === t.testId,
                            );
                            if (row) setSavedByTestId((prev) => ({ ...prev, [t.testId]: row }));
                          }
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      Сохранить
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className={cn(patientMutedTextClass, "text-[11px]")}>Комментарий (необязательно)</Label>
                    <Textarea
                      className={cn(patientFormSurfaceClass, "min-h-[56px] text-sm")}
                      value={numericNotes[t.testId] ?? ""}
                      onChange={(e) => setNumericNotes((s) => ({ ...s, [t.testId]: e.target.value }))}
                      disabled={busy !== null}
                      rows={2}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className={cn(patientMutedTextClass, "text-[11px]")}>Итог</Label>
                    <Select
                      value={qualDecisions[t.testId] || undefined}
                      onValueChange={(v) =>
                        setQualDecisions((s) => ({ ...s, [t.testId]: v as NormalizedTestDecision }))
                      }
                      disabled={busy !== null}
                      items={patientTestQualDecisionSelectItems}
                    >
                      <SelectTrigger
                        className="h-9 max-w-[280px] text-sm"
                        displayLabel={
                          qualDecisions[t.testId]
                            ? patientTestQualDecisionSelectItems[qualDecisions[t.testId]!]
                            : undefined
                        }
                      >
                        <SelectValue placeholder="Выберите итог" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passed">{formatNormalizedTestDecisionRu("passed")}</SelectItem>
                        <SelectItem value="failed">{formatNormalizedTestDecisionRu("failed")}</SelectItem>
                        <SelectItem value="partial">{formatNormalizedTestDecisionRu("partial")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className={cn(patientMutedTextClass, "text-[11px]")}>Комментарий (необязательно)</Label>
                    <Textarea
                      className={cn(patientFormSurfaceClass, "min-h-[72px] text-sm")}
                      value={qualNotes[t.testId] ?? ""}
                      onChange={(e) => setQualNotes((s) => ({ ...s, [t.testId]: e.target.value }))}
                      disabled={busy !== null}
                      rows={3}
                    />
                  </div>
                  <button
                    type="button"
                    className={cn(patientCompactActionClass, "h-8 w-auto text-sm")}
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(itemId + t.testId);
                      setError(null);
                      setErrorByTestId((e) => ({ ...e, [t.testId]: "" }));
                      try {
                        let attemptId = hydratedAttemptId;
                        if (!attemptId) {
                          attemptId = await ensureAttempt();
                          if (!attemptId) return;
                          setHydratedAttemptId(attemptId);
                        }
                        const d = qualDecisions[t.testId];
                        if (d !== "passed" && d !== "failed" && d !== "partial") {
                          setErrorByTestId((e) => ({
                            ...e,
                            [t.testId]: "Выберите итог: зачтено, не зачтено или частично.",
                          }));
                          return;
                        }
                        const note = qualNotes[t.testId]?.trim() ?? "";
                        const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-result`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            testId: t.testId,
                            rawValue: note ? { note } : {},
                            normalizedDecision: d,
                          }),
                        });
                        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                        if (!res.ok || !data.ok) {
                          const msg = data.error ?? "Ошибка сохранения";
                          setErrorByTestId((e) => ({ ...e, [t.testId]: msg }));
                          return;
                        }
                        await onDone();
                        const jsonRes = await fetch(
                          `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/test-results`,
                        );
                        const jsonData = (await jsonRes.json().catch(() => null)) as {
                          results?: TreatmentProgramTestResultDetailRow[];
                        };
                        if (jsonRes.ok && Array.isArray(jsonData.results) && attemptId) {
                          const row = jsonData.results.find(
                            (r) =>
                              r.instanceStageItemId === itemId &&
                              r.attemptId === attemptId &&
                              r.testId === t.testId,
                          );
                          if (row) setSavedByTestId((prev) => ({ ...prev, [t.testId]: row }));
                        }
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Сохранить
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
