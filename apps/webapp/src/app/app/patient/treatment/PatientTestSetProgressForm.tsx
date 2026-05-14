"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { patientTestQualDecisionSelectItems } from "@/shared/ui/selectOpaqueValueLabels";
import type { PatientTestSetPageServerSnapshot, PatientTestSetSubmittedAttemptDetail } from "@/modules/treatment-program/progress-service";
import type {
  NormalizedTestDecision,
  TreatmentProgramTestAttemptBrief,
  TreatmentProgramTestResultDetailRow,
  TreatmentProgramTestResultRow,
} from "@/modules/treatment-program/types";
import { formatNormalizedTestDecisionRu } from "@/modules/treatment-program/types";
import { parseTestSetSnapshotTests, testIdsFromTestSetSnapshot } from "@/modules/treatment-program/testSetSnapshotView";
import { scoringAllowsNumericDecisionInference } from "@/modules/treatment-program/progress-scoring";
import {
  patientCompactActionClass,
  patientFormSurfaceClass,
  patientMutedTextClass,
  PatientShimmerPanel,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function AttemptHistoryCollapsibleList(props: {
  bundles: PatientTestSetSubmittedAttemptDetail[];
  testsMetaToRender: ReturnType<typeof parseTestSetSnapshotTests>;
}) {
  const { bundles, testsMetaToRender } = props;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {bundles.map((bundle) => (
        <li key={bundle.attemptId}>
          <Collapsible
            defaultOpen={false}
            className="rounded-md border border-[var(--patient-border)]/50 bg-[var(--patient-card-bg)]/80"
          >
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left">
              <span className={cn(patientMutedTextClass, "text-[11px]")}>
                {bundle.submittedAt ? `Отправлено ${bundle.submittedAt.slice(0, 10)}` : "—"}
                {bundle.acceptedAt ? ` · принято ${bundle.acceptedAt.slice(0, 10)}` : ""}
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-[var(--patient-text-muted)] transition-transform duration-200",
                  "group-data-[panel-open]:rotate-180",
                )}
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-[var(--patient-border)]/40 px-2 pb-2 pt-1">
              <ul className="m-0 list-none space-y-1.5 p-0">
                {testsMetaToRender.map((t) => {
                  const row = bundle.results.find((r) => r.testId === t.testId);
                  if (!row) return null;
                  return (
                    <li
                      key={`${bundle.attemptId}-${t.testId}`}
                      className="rounded border border-[var(--patient-border)]/40 px-2 py-1"
                    >
                      <span className="text-xs font-medium">{t.title ?? t.testId}</span>
                      <p className={cn(patientMutedTextClass, "mt-0.5 mb-0 text-[11px]")}>
                        Итог: {formatNormalizedTestDecisionRu(row.normalizedDecision)}
                        {row.decidedBy ? " (уточнено врачом)" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </li>
      ))}
    </ul>
  );
}

export type PatientTestSetProgressFormProps = {
  instanceId: string;
  itemId: string;
  snapshot: Record<string, unknown>;
  /** Набор отправлен или пункт принят врачом — только просмотр до «Новой попытки». */
  readOnlySummary: boolean;
  /** Нет ввода: заблокированный этап, read-only навигация и т.п. */
  interactionDisabled: boolean;
  /** Данные с RSC: без начальных client fetch для попытки/результатов. */
  serverSnapshot?: PatientTestSetPageServerSnapshot | null;
  baseUrl: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  onDone: () => Promise<void>;
  /** Только один тест (страница пункта с `nav=tests`). */
  activeTestId?: string;
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
  attemptHistory?: TreatmentProgramTestAttemptBrief[],
): TreatmentProgramTestResultDetailRow {
  const ta = attemptHistory?.find((a) => a.id === r.attemptId);
  return {
    ...r,
    instanceStageItemId,
    stageId: "",
    stageTitle: "",
    stageSortOrder: 0,
    testTitle: null,
    attemptStartedAt: ta?.startedAt ?? r.createdAt,
    attemptSubmittedAt: ta?.submittedAt ?? null,
    attemptAcceptedAt: ta?.acceptedAt ?? null,
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
    readOnlySummary,
    interactionDisabled,
    serverSnapshot = null,
    baseUrl,
    busy,
    setBusy,
    setError,
    onDone,
    activeTestId,
  } = props;

  const testIds = useMemo(() => testIdsFromTestSetSnapshot(snapshot), [snapshot]);
  const testsMeta = useMemo(() => parseTestSetSnapshotTests(snapshot), [snapshot]);
  const testsMetaToRender = useMemo(
    () => (activeTestId ? testsMeta.filter((t) => t.testId === activeTestId) : testsMeta),
    [testsMeta, activeTestId],
  );

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

    if (snap.variant === "readonly_submitted") {
      const nextSaved: Record<string, TreatmentProgramTestResultDetailRow> = {};
      for (const r of snap.results) {
        nextSaved[r.testId] = augmentResultRowToDetail(r, itemId, snap.attemptHistory);
      }
      setSavedByTestId(nextSaved);
      setCompletedSummaryLoaded(true);
      return;
    }

    if (interactionDisabled && !readOnlySummary) {
      setCompletedSummaryLoaded(true);
      return;
    }

    if (snap.variant === "open_attempt") {
      if (snap.attemptId) {
        const detailRows = snap.results.map((r) => augmentResultRowToDetail(r, itemId, snap.attemptHistory));
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
      return;
    }

    setCompletedSummaryLoaded(false);
  }, [serverSnapshot, itemId, snapshot, readOnlySummary, interactionDisabled, setError]);

  useEffect(() => {
    const snap = serverSnapshot ?? { variant: "none" as const };
    if (snap.variant === "readonly_submitted") return;
    if (snap.variant === "open_attempt" && snap.attemptId != null) return;

    let cancelled = false;

    async function hydrate() {
      setError(null);
      setErrorByTestId({});
      setHydratedAttemptId(null);
      setSavedByTestId({});
      setCompletedSummaryLoaded(false);
      const lines = parseTestSetSnapshotTests(snapshot);

      try {
        if (readOnlySummary) {
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
    readOnlySummary,
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

  if (readOnlySummary) {
    if (!completedSummaryLoaded) {
      return (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Набор отправлен.</p>
        </div>
      );
    }
    const snapRO = serverSnapshot?.variant === "readonly_submitted" ? serverSnapshot : null;
    const bundles = snapRO?.submittedAttemptsDetail ?? [];
    const hasBundles = bundles.length > 0;
    const anyRow = testIds.some((tid) => Boolean(savedByTestId[tid]));
    return (
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          {snapRO?.doctorAcceptedItem ? "Пункт принят врачом." : "Набор отправлен."}
        </p>
        {hasBundles ? (
          <AttemptHistoryCollapsibleList bundles={bundles} testsMetaToRender={testsMetaToRender} />
        ) : snapRO ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {snapRO.attemptHistory.map((a) => (
              <li key={a.id} className={cn(patientMutedTextClass, "text-[11px]")}>
                {a.submittedAt ? `Отправлено ${a.submittedAt.slice(0, 10)}` : `Начато ${a.startedAt.slice(0, 10)}`}
                {a.acceptedAt ? ` · принято ${a.acceptedAt.slice(0, 10)}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {!interactionDisabled && snapRO ? (
          <button
            type="button"
            className={cn(patientCompactActionClass, "h-8 w-auto self-start text-sm")}
            disabled={busy !== null}
            onClick={async () => {
              setBusy("new-attempt");
              setError(null);
              try {
                const res = await fetch(
                  `${baseUrl}/${encodeURIComponent(itemId)}/progress/start-new-test-attempt`,
                  { method: "POST" },
                );
                const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                if (!res.ok || !data.ok) {
                  setError(data.error ?? "Не удалось начать попытку");
                  return;
                }
                await onDone();
              } finally {
                setBusy(null);
              }
            }}
          >
            Новая попытка
          </button>
        ) : null}
        {!hasBundles && anyRow ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {testsMetaToRender.map((t) => {
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
        ) : !hasBundles ? (
          <p className={cn(patientMutedTextClass, "text-xs")}>Детали результатов недоступны.</p>
        ) : null}
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
        aria-label="Загрузка"
      >
        <PatientShimmerPanel />
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

      {serverSnapshot?.variant === "open_attempt" && serverSnapshot.submittedAttemptsDetail.length > 0 ? (
        <AttemptHistoryCollapsibleList
          bundles={serverSnapshot.submittedAttemptsDetail}
          testsMetaToRender={testsMetaToRender}
        />
      ) : null}

      {testsMeta.length === 0 ? (
        <p className="text-xs text-destructive">В снимке нет списка тестов.</p>
      ) : (
        testsMetaToRender.map((t) => {
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
              {!activeTestId && t.comment ? (
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
