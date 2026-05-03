"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramTestResultDetailRow,
} from "@/modules/treatment-program/types";
import {
  effectiveInstanceStageItemComment,
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramStageStatusRu,
} from "@/modules/treatment-program/types";
import {
  isInstanceStageItemActiveForPatient,
  isPersistentRecommendation,
  isStageZero,
  patientStageItemShowsNewBadge,
} from "@/modules/treatment-program/stage-semantics";
import { testIdsFromTestSetSnapshot } from "@/modules/treatment-program/progress-service";
import { buildPatientProgramChecklistRows, type PatientProgramChecklistRow } from "@/modules/treatment-program/patient-program-actions";
import { cn } from "@/lib/utils";
import {
  patientCardClass,
  patientListItemClass,
  patientMutedTextClass,
  patientPrimaryActionClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
  patientBodyTextClass,
  patientPillClass,
  patientFormSurfaceClass,
} from "@/shared/ui/patientVisual";

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

function patientStageHasHeaderFields(stage: {
  goals: string | null;
  objectives: string | null;
  expectedDurationDays: number | null;
  expectedDurationText: string | null;
}): boolean {
  return Boolean(
    stage.goals?.trim() ||
      stage.objectives?.trim() ||
      stage.expectedDurationDays != null ||
      stage.expectedDurationText?.trim(),
  );
}

function PatientStageHeaderFields(props: {
  stage: {
    goals: string | null;
    objectives: string | null;
    expectedDurationDays: number | null;
    expectedDurationText: string | null;
  };
}) {
  const { stage } = props;
  if (!patientStageHasHeaderFields(stage)) return null;
  const durationLine = [
    stage.expectedDurationDays != null ? `${stage.expectedDurationDays} дн.` : null,
    stage.expectedDurationText?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn(patientSectionSurfaceClass, "mb-4 shadow-none")}>
      {stage.goals?.trim() ? (
        <div>
          <p className={patientSectionTitleClass}>Цель</p>
          <p className={cn(patientBodyTextClass, "mt-1 whitespace-pre-wrap")}>{stage.goals.trim()}</p>
        </div>
      ) : null}
      {stage.objectives?.trim() ? (
        <div>
          <p className={patientSectionTitleClass}>Задачи</p>
          <p className={cn(patientBodyTextClass, "mt-1 whitespace-pre-wrap")}>{stage.objectives.trim()}</p>
        </div>
      ) : null}
      {durationLine ? (
        <div>
          <p className={patientSectionTitleClass}>Ожидаемый срок</p>
          <p className={cn(patientMutedTextClass, "mt-1 text-sm")}>{durationLine}</p>
        </div>
      ) : null}
    </div>
  );
}

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function usePostMarkItemViewedWhenVisible(opts: {
  instanceId: string;
  itemId: string;
  enabled: boolean;
  onDone: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { instanceId, itemId, enabled, onDone } = opts;
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    let done = false;
    const obs = new IntersectionObserver(
      (entries) => {
        if (done) return;
        const e = entries[0];
        if (!e?.isIntersecting || e.intersectionRatio < 0.35) return;
        done = true;
        void fetch(
          `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/mark-viewed`,
          { method: "POST" },
        )
          .then(() => onDone())
          .catch(() => {});
        obs.disconnect();
      },
      { threshold: [0, 0.35, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, instanceId, itemId, onDone]);
  return ref;
}

function PatientInstanceStageItemCard(props: {
  instanceId: string;
  item: TreatmentProgramInstanceDetail["stages"][number]["items"][number];
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  contentBlocked: boolean;
}) {
  const { instanceId, item, base, busy, setBusy, setError, refresh, contentBlocked } = props;
  const showsNew = patientStageItemShowsNewBadge(item, contentBlocked);
  const markRef = usePostMarkItemViewedWhenVisible({
    instanceId,
    itemId: item.id,
    enabled: showsNew,
    onDone: () => {
      void refresh();
    },
  });
  return (
    <li
      ref={markRef}
      className={cn(
        patientListItemClass,
        "border-[var(--patient-border)]/80 bg-[var(--patient-color-primary-soft)]/10",
      )}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{snapshotTitle(item.snapshot, item.itemType)}</span>
        {showsNew ? <span className={patientPillClass}>Новое</span> : null}{" "}
        <span className={cn(patientMutedTextClass, "font-normal")}>({item.itemType})</span>
      </p>
      {isPersistentRecommendation(item) ? (
        <p className="mt-1">
          <span className={patientPillClass}>Постоянная рекомендация</span>
        </p>
      ) : null}
      {effectiveInstanceStageItemComment(item) ? (
        <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
          Комментарий:{" "}
          <span className="text-foreground">{effectiveInstanceStageItemComment(item)}</span>
        </p>
      ) : null}
      <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
        Элемент:{" "}
        {item.completedAt ? (
          <span className="text-emerald-600 dark:text-emerald-400">выполнен</span>
        ) : (
          <span>не выполнен</span>
        )}
      </p>

      {!contentBlocked ? (
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
        ) : !isPersistentRecommendation(item) ? (
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              className={cn(patientPrimaryActionClass, "!h-9 !min-h-0 w-auto px-3 text-sm")}
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
        ) : null
      ) : null}
    </li>
  );
}

function PatientInstanceStageBody(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  /** Этап 0: контент элементов доступен независимо от статуса «заблокирован» этапа. */
  ignoreStageLockForContent: boolean;
  surfaceClass: string;
  heading: ReactNode;
}) {
  const { instanceId, stage, base, busy, setBusy, setError, refresh, ignoreStageLockForContent, surfaceClass, heading } =
    props;
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");
  const visibleItems = stage.items.filter(isInstanceStageItemActiveForPatient);
  const sortedGroups = sortByOrderThenId(stage.groups).filter((g) =>
    visibleItems.some((it) => it.groupId === g.id),
  );
  const ungroupedItems = sortByOrderThenId(visibleItems.filter((it) => !it.groupId));

  return (
    <section className={surfaceClass}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">{heading}</div>
      <PatientStageHeaderFields stage={stage} />
      {contentBlocked ? (
        <p className={patientMutedTextClass}>Этап откроется после завершения предыдущего или по решению врача.</p>
      ) : null}
      <div className="m-0 space-y-4 p-0">
        {sortedGroups.map((g) => {
          const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
          return (
            <details
              key={g.id}
              className={cn(
                patientListItemClass,
                "border-[var(--patient-border)]/80 bg-[var(--patient-color-primary-soft)]/5",
              )}
              open
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-foreground">{g.title}</span>
                {g.scheduleText?.trim() ? (
                  <span className={cn(patientMutedTextClass, "mt-1 block text-xs")}>
                    {g.scheduleText.trim()}
                  </span>
                ) : null}
              </summary>
              {g.description?.trim() ? (
                <p className={cn(patientBodyTextClass, "mt-2 whitespace-pre-wrap text-sm")}>{g.description.trim()}</p>
              ) : null}
              <ul className="m-0 mt-3 list-none space-y-4 p-0">
                {gItems.map((item) => (
                  <PatientInstanceStageItemCard
                    key={item.id}
                    instanceId={instanceId}
                    item={item}
                    base={base}
                    busy={busy}
                    setBusy={setBusy}
                    setError={setError}
                    refresh={refresh}
                    contentBlocked={contentBlocked}
                  />
                ))}
              </ul>
            </details>
          );
        })}
        {ungroupedItems.length > 0 ? (
          <div className="space-y-3">
            {sortedGroups.length > 0 ? (
              <p className={cn(patientSectionTitleClass, "text-sm")}>Без группы</p>
            ) : null}
            <ul className="m-0 list-none space-y-4 p-0">
              {ungroupedItems.map((item) => (
                <PatientInstanceStageItemCard
                  key={item.id}
                  instanceId={instanceId}
                  item={item}
                  base={base}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  refresh={refresh}
                  contentBlocked={contentBlocked}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PatientLfkChecklistRow(props: {
  row: PatientProgramChecklistRow;
  itemBaseUrl: string;
  done: boolean;
  onUpdated: (ids: string[]) => void;
  setError: (e: string | null) => void;
}) {
  const { row, itemBaseUrl, done, onUpdated, setError } = props;
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  if (done) {
    return (
      <div className={cn(patientListItemClass, "flex flex-col gap-1 border-[var(--patient-border)]/70")}>
        <span className="text-sm font-medium">{snapshotTitle(row.item.snapshot, row.item.itemType)}</span>
        {row.groupTitle ? (
          <span className={cn(patientMutedTextClass, "text-xs")}>{row.groupTitle}</span>
        ) : null}
        <span className="text-xs text-emerald-600 dark:text-emerald-400">Сегодня занятие отмечено</span>
      </div>
    );
  }

  return (
    <div className={cn(patientFormSurfaceClass, "border border-[var(--patient-border)]/70")}>
      <p className="text-sm font-medium">{snapshotTitle(row.item.snapshot, row.item.itemType)}</p>
      {row.groupTitle ? <p className={cn(patientMutedTextClass, "text-xs")}>{row.groupTitle}</p> : null}
      <div className="flex flex-col gap-2">
        <Label className={cn(patientMutedTextClass, "text-xs")}>Как прошло занятие?</Label>
        <Select
          value={difficulty}
          onValueChange={(v) => setDifficulty(v as "easy" | "medium" | "hard")}
          disabled={pending}
        >
          <SelectTrigger className="h-10 w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">Легко</SelectItem>
            <SelectItem value="medium">Средне</SelectItem>
            <SelectItem value="hard">Тяжело</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`lfk-note-${row.item.id}`} className={cn(patientMutedTextClass, "text-xs")}>
          Заметка для врача
        </Label>
        <Textarea
          id={`lfk-note-${row.item.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          rows={3}
          className="min-h-[72px] resize-y text-sm"
          maxLength={4000}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className={cn(patientPrimaryActionClass, "!h-9 w-fit")}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await fetch(`${itemBaseUrl}/${encodeURIComponent(row.item.id)}/progress/lfk-session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ difficulty, note: note.trim() || null }),
            });
            const data = (await res.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[]; error?: string };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Ошибка сохранения");
              return;
            }
            if (data.doneItemIds) onUpdated(data.doneItemIds);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Сохраняю…" : "Сохранить"}
      </Button>
    </div>
  );
}

export function PatientTreatmentProgramDetailClient(props: {
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
}) {
  const [detail, setDetail] = useState(props.initial);
  const [testResults, setTestResults] = useState(props.initialTestResults);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setError(null);
    const id = detail.id;
    const [instRes, trRes, checklistRes] = await Promise.all([
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/test-results`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/checklist-today`),
    ]);
    const data = (await instRes.json().catch(() => null)) as { ok?: boolean; item?: TreatmentProgramInstanceDetail };
    if (!instRes.ok || !data.ok || !data.item) {
      setError("Не удалось обновить данные");
      return;
    }
    setDetail(data.item);
    const trData = (await trRes.json().catch(() => null)) as { ok?: boolean; results?: TreatmentProgramTestResultDetailRow[] };
    if (trRes.ok && trData.ok && trData.results) setTestResults(trData.results);
    const chData = (await checklistRes.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
    if (data.item.status === "active" && checklistRes.ok && chData.ok && Array.isArray(chData.doneItemIds)) {
      setDoneItemIds(chData.doneItemIds);
    } else {
      setDoneItemIds([]);
    }
  }, [detail.id]);

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/items`;

  const checklistRows = useMemo(() => buildPatientProgramChecklistRows(detail), [detail]);

  useEffect(() => {
    void (async () => {
      if (detail.status !== "active") {
        setDoneItemIds([]);
        return;
      }
      const res = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/checklist-today`,
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
      if (res.ok && data?.ok && Array.isArray(data.doneItemIds)) setDoneItemIds(data.doneItemIds);
    })();
  }, [detail.id, detail.status]);

  useEffect(() => {
    if (detail.status !== "active") return;
    void fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/plan-opened`, {
      method: "POST",
    }).catch(() => {});
  }, [detail.id, detail.status]);

  const stageZeroStages = useMemo(() => detail.stages.filter((s) => isStageZero(s)), [detail.stages]);
  const otherStages = useMemo(() => detail.stages.filter((s) => !isStageZero(s)), [detail.stages]);

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className={patientCardClass}>
        <h2 className="text-lg font-semibold tracking-tight">{detail.title}</h2>
        <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
          Статус программы: {detail.status === "completed" ? "завершена" : "активна"}
        </p>
      </div>

      {detail.status === "active" && checklistRows.length > 0 ? (
        <section className={patientSectionSurfaceClass} aria-label="Чек-лист на сегодня">
          <h3 className={patientSectionTitleClass}>Чек-лист на сегодня</h3>
          <p className={cn(patientMutedTextClass, "mb-3 text-xs")}>
            Отметьте выполненное за сегодня (UTC). ЛФК — краткая оценка занятия (O2: уровень комплекса).
          </p>
          <ul className="m-0 list-none space-y-4 p-0">
            {checklistRows.map((row) => (
              <li key={row.item.id}>
                {row.item.itemType === "lfk_complex" ? (
                  <PatientLfkChecklistRow
                    row={row}
                    itemBaseUrl={base}
                    done={doneItemIds.includes(row.item.id)}
                    onUpdated={setDoneItemIds}
                    setError={setError}
                  />
                ) : (
                  <label className={patientListItemClass}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={doneItemIds.includes(row.item.id)}
                      disabled={busy !== null}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        setBusy(row.item.id);
                        setError(null);
                        try {
                          const res = await fetch(
                            `${base}/${encodeURIComponent(row.item.id)}/progress/checklist`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ checked }),
                            },
                          );
                          const data = (await res.json().catch(() => null)) as {
                            ok?: boolean;
                            doneItemIds?: string[];
                            error?: string;
                          };
                          if (!res.ok || !data.ok) {
                            setError(data.error ?? "Ошибка");
                            e.target.checked = !checked;
                            return;
                          }
                          if (data.doneItemIds) setDoneItemIds(data.doneItemIds);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium">
                        {snapshotTitle(row.item.snapshot, row.item.itemType)}
                      </span>
                      {row.groupTitle ? (
                        <span className={cn(patientMutedTextClass, "mt-0.5 block text-xs")}>{row.groupTitle}</span>
                      ) : null}
                    </span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {testResults.length > 0 ? (
        <section className={patientCardClass} aria-label="Результаты тестов">
          <h3 className="text-base font-semibold">Ваши результаты тестов</h3>
          <ul className="mt-3 list-none space-y-2 p-0 text-sm">
            {testResults.map((r) => (
              <li key={r.id} className={cn(patientListItemClass, "border-[var(--patient-border)]/70 bg-[var(--patient-color-primary-soft)]/15")}>
                <p className="font-medium">
                  {r.testTitle ?? r.testId}{" "}
                  <span className={cn(patientMutedTextClass, "text-xs font-normal")}>
                    ({r.stageTitle}) · {formatNormalizedTestDecisionRu(r.normalizedDecision)}
                  </span>
                  {r.decidedBy ? (
                    <span className="ml-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
                      итог уточнён врачом
                    </span>
                  ) : null}
                </p>
                <pre className={cn(patientMutedTextClass, "mt-1 max-h-24 overflow-auto text-[11px]")}>
                  {JSON.stringify(r.rawValue, null, 0)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stageZeroStages.map((stage) => (
        <PatientInstanceStageBody
          key={stage.id}
          instanceId={detail.id}
          stage={stage}
          base={base}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          refresh={refresh}
          ignoreStageLockForContent
          surfaceClass={patientSectionSurfaceClass}
          heading={
            <>
              <h3 className={patientSectionTitleClass}>Общие рекомендации</h3>
              {stage.title.trim() ? (
                <span className={cn(patientMutedTextClass, "text-xs font-normal normal-case")}>{stage.title}</span>
              ) : null}
              <span className={cn(patientMutedTextClass, "text-xs uppercase tracking-wide")}>
                {formatTreatmentProgramStageStatusRu(stage.status)}
              </span>
            </>
          }
        />
      ))}

      {otherStages.map((stage) => (
        <PatientInstanceStageBody
          key={stage.id}
          instanceId={detail.id}
          stage={stage}
          base={base}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          refresh={refresh}
          ignoreStageLockForContent={false}
          surfaceClass={patientCardClass}
          heading={
            <>
              <h3 className="text-base font-semibold">{stage.title}</h3>
              <span className={cn(patientMutedTextClass, "text-xs uppercase tracking-wide")}>
                {formatTreatmentProgramStageStatusRu(stage.status)}
              </span>
            </>
          }
        />
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
      <p className={cn(patientMutedTextClass, "text-xs")}>Введите числовой балл (score) для каждого теста, если настроены пороги в программе, или укажите итог вручную.</p>
      {testsMeta.length === 0 ? (
        <p className="text-xs text-destructive">В снимке нет списка тестов.</p>
      ) : (
        testsMeta.map((t) => (
          <div
            key={t.testId}
            className="flex flex-col gap-1 rounded-lg border border-[var(--patient-border)]/60 bg-[var(--patient-card-bg)] p-2"
          >
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
                className={cn(patientPrimaryActionClass, "!h-8 !min-h-0 w-auto px-3 text-sm")}
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
        <p className={cn(patientMutedTextClass, "text-[11px]")}>Тестов в наборе: {testIds.length}</p>
      ) : null}
    </div>
  );
}
