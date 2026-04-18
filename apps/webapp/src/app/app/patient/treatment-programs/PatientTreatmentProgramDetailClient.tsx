"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramTestResultDetailRow,
} from "@/modules/treatment-program/types";
import {
  effectiveInstanceStageItemComment,
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramStageStatusRu,
} from "@/modules/treatment-program/types";
import { testIdsFromTestSetSnapshot } from "@/modules/treatment-program/progress-service";

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

export function PatientTreatmentProgramDetailClient(props: {
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
}) {
  const [detail, setDetail] = useState(props.initial);
  const [testResults, setTestResults] = useState(props.initialTestResults);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const id = detail.id;
    const [instRes, trRes] = await Promise.all([
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/test-results`),
    ]);
    const data = (await instRes.json().catch(() => null)) as { ok?: boolean; item?: TreatmentProgramInstanceDetail };
    if (!instRes.ok || !data.ok || !data.item) {
      setError("Не удалось обновить данные");
      return;
    }
    setDetail(data.item);
    const trData = (await trRes.json().catch(() => null)) as { ok?: boolean; results?: TreatmentProgramTestResultDetailRow[] };
    if (trRes.ok && trData.ok && trData.results) setTestResults(trData.results);
  }, [detail.id]);

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/items`;

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold tracking-tight">{detail.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Статус программы: {detail.status === "completed" ? "завершена" : "активна"}
        </p>
      </div>

      {testResults.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4" aria-label="Результаты тестов">
          <h3 className="text-base font-semibold">Ваши результаты тестов</h3>
          <ul className="mt-3 list-none space-y-2 p-0 text-sm">
            {testResults.map((r) => (
              <li key={r.id} className="rounded-lg border border-border/70 bg-muted/15 p-2">
                <p className="font-medium">
                  {r.testTitle ?? r.testId}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({r.stageTitle}) · {formatNormalizedTestDecisionRu(r.normalizedDecision)}
                  </span>
                  {r.decidedBy ? (
                    <span className="ml-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
                      итог уточнён врачом
                    </span>
                  ) : null}
                </p>
                <pre className="mt-1 max-h-24 overflow-auto text-[11px] text-muted-foreground">
                  {JSON.stringify(r.rawValue, null, 0)}
                </pre>
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
          </div>
          {stage.status === "locked" ? (
            <p className="text-sm text-muted-foreground">Этап откроется после завершения предыдущего или по решению врача.</p>
          ) : null}
          <ul className="m-0 list-none space-y-4 p-0">
            {stage.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border/80 bg-muted/20 p-3">
                <p className="text-sm font-medium">
                  {snapshotTitle(item.snapshot, item.itemType)}{" "}
                  <span className="font-normal text-muted-foreground">({item.itemType})</span>
                </p>
                {effectiveInstanceStageItemComment(item) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Комментарий:{" "}
                    <span className="text-foreground">{effectiveInstanceStageItemComment(item)}</span>
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Элемент:{" "}
                  {item.completedAt ? (
                    <span className="text-emerald-600 dark:text-emerald-400">выполнен</span>
                  ) : (
                    <span>не выполнен</span>
                  )}
                </p>

                {stage.status !== "locked" && stage.status !== "skipped" ? (
                  item.itemType === "test_set" ? (
                    <TestSetBlock
                      itemId={item.id}
                      snapshot={item.snapshot}
                      completed={Boolean(item.completedAt)}
                      baseUrl={base}
                      busy={busy}
                      setBusy={setBusy}
                      setError={setError}
                      onDone={refresh}
                    />
                  ) : (
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={Boolean(item.completedAt) || busy !== null}
                        onClick={async () => {
                          setBusy(item.id);
                          setError(null);
                          try {
                            const res = await fetch(`${base}/${encodeURIComponent(item.id)}/progress/complete`, {
                              method: "POST",
                            });
                            const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                            if (!res.ok || !data.ok) {
                              setError(data.error ?? "Ошибка");
                              return;
                            }
                            await refresh();
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        {item.completedAt ? "Готово" : "Отметить выполненным"}
                      </Button>
                    </div>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TestSetBlock(props: {
  itemId: string;
  snapshot: Record<string, unknown>;
  completed: boolean;
  baseUrl: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  onDone: () => Promise<void>;
}) {
  const { itemId, snapshot, completed, baseUrl, busy, setBusy, setError, onDone } = props;
  const testIds = useMemo(() => testIdsFromTestSetSnapshot(snapshot), [snapshot]);
  const testsMeta = useMemo(() => {
    const arr = snapshot.tests;
    if (!Array.isArray(arr)) return [] as { testId: string; title: string | null }[];
    return arr
      .map((t) => {
        if (!t || typeof t !== "object" || !("testId" in t)) return null;
        const testId = String((t as { testId: unknown }).testId);
        const title =
          "title" in t && typeof (t as { title: unknown }).title === "string"
            ? (t as { title: string }).title
            : null;
        return { testId, title };
      })
      .filter((x): x is { testId: string; title: string | null } => x != null && x.testId.length > 0);
  }, [snapshot]);

  const [scores, setScores] = useState<Record<string, string>>({});

  const ensureAttempt = useCallback(async () => {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-attempt`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Не удалось начать попытку");
      return false;
    }
    return true;
  }, [baseUrl, itemId, setError]);

  if (completed) {
    return <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Набор тестов пройден.</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Введите числовой балл (score) для каждого теста, если настроены пороги в программе, или укажите итог вручную.</p>
      {testsMeta.length === 0 ? (
        <p className="text-xs text-destructive">В снимке нет списка тестов.</p>
      ) : (
        testsMeta.map((t) => (
          <div key={t.testId} className="flex flex-col gap-1 rounded border border-border/60 p-2">
            <span className="text-xs font-medium">{t.title ?? t.testId}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                className="h-8 max-w-[120px] text-sm"
                placeholder="score"
                value={scores[t.testId] ?? ""}
                onChange={(e) => setScores((s) => ({ ...s, [t.testId]: e.target.value }))}
                disabled={busy !== null}
              />
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(itemId + t.testId);
                  setError(null);
                  try {
                    if (!(await ensureAttempt())) return;
                    const raw = scores[t.testId]?.trim();
                    const num = raw === "" || raw === undefined ? NaN : Number(raw);
                    const body: Record<string, unknown> = {
                      testId: t.testId,
                      rawValue: Number.isFinite(num) ? { score: num } : { value: raw ?? "" },
                    };
                    if (!Number.isFinite(num)) {
                      body.normalizedDecision = "partial";
                    }
                    const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-result`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                    if (!res.ok || !data.ok) {
                      setError(data.error ?? "Ошибка сохранения");
                      return;
                    }
                    await onDone();
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Сохранить
              </Button>
            </div>
          </div>
        ))
      )}
      {testIds.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">Тестов в наборе: {testIds.length}</p>
      ) : null}
    </div>
  );
}
