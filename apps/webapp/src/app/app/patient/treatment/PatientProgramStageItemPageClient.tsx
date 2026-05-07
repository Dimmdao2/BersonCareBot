"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  patientLfkDifficultySelectItems,
  patientTestQualDecisionSelectItems,
} from "@/shared/ui/selectOpaqueValueLabels";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import type {
  NormalizedTestDecision,
  TreatmentProgramInstanceDetail,
} from "@/modules/treatment-program/types";
import { formatNormalizedTestDecisionRu } from "@/modules/treatment-program/types";
import { type PatientProgramChecklistRow } from "@/modules/treatment-program/patient-program-actions";
import { listLfkSnapshotExerciseLines } from "@/modules/treatment-program/programActionActivityKey";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";
import { testIdsFromTestSetSnapshot } from "@/modules/treatment-program/testSetSnapshotView";
import { scoringAllowsNumericDecisionInference } from "@/modules/treatment-program/progress-scoring";
import {
  isPersistentRecommendation,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientProgramItemNavMode } from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import { resolvePatientProgramItemPage } from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { PatientMediaPlaybackVideo } from "@/shared/ui/media/PatientMediaPlaybackVideo";
import { parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import {
  parseSnapshotMediaForRowThumb,
  pickRecommendationRowPreviewMedia,
  primaryMediaForStageItem,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import { patientHomeCardHeroClass } from "@/app/app/patient/home/patientHomeCardStyles";
import {
  patientBodyTextClass,
  patientButtonPrimaryClass,
  patientButtonSkipClass,
  patientButtonSuccessClass,
  patientCompactActionClass,
  patientFormSurfaceClass,
  patientHeroTitleBaseClass,
  patientInnerHeroTitleTypographyClass,
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientScrollbarHiddenClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

const EMPTY_ORDERED_ITEM_IDS: string[] = [];

export type PatientProgramStageItemPageClientProps = {
  instanceId: string;
  itemId: string;
  navMode: PatientProgramItemNavMode;
  backHref: string;
  initialDetail: TreatmentProgramInstanceDetail;
};

type StageItem = TreatmentProgramInstanceDetail["stages"][number]["items"][number];

function modalSnapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

function formatCharacteristics(item: StageItem): string[] {
  const snap = item.snapshot as Record<string, unknown>;
  const parts: string[] = [];

  if (item.itemType === "exercise") {
    const d = snap.difficulty;
    if (typeof d === "number" && Number.isFinite(d)) parts.push(`Сложность: ${d}/10`);
    else if (typeof d === "string" && d.trim()) parts.push(`Сложность: ${d.trim()}`);
    if (typeof snap.loadType === "string" && snap.loadType.trim())
      parts.push(`Нагрузка: ${snap.loadType.trim()}`);
  }

  if (item.itemType === "lfk_complex") {
    const lines = listLfkSnapshotExerciseLines(snap);
    if (lines.length > 0) parts.push(`Упражнений: ${lines.length}`);
    const first = lines[0];
    if (first) {
      if (first.sets != null) parts.push(`Подходов: ${first.sets}`);
      if (first.reps != null) parts.push(`Повторений: ${first.reps}`);
      if (first.maxPain != null) parts.push(`Макс. боль: ${first.maxPain}/10`);
    }
  }

  if (item.itemType === "recommendation") {
    if (typeof snap.durationText === "string" && snap.durationText.trim())
      parts.push(snap.durationText.trim());
    if (typeof snap.frequencyText === "string" && snap.frequencyText.trim())
      parts.push(snap.frequencyText.trim());
    if (typeof snap.quantityText === "string" && snap.quantityText.trim())
      parts.push(snap.quantityText.trim());
  }

  if (item.itemType === "test_set") {
    const tests = parseTestSetSnapshotTests(snap);
    if (tests.length > 0) parts.push(`Тестов в наборе: ${tests.length}`);
  }

  if (item.itemType === "lesson") {
    if (typeof snap.summary === "string" && snap.summary.trim()) parts.push(snap.summary.trim());
  }

  return parts;
}

function ModalMediaBlock(props: { media: RecommendationMediaItem | null; title: string }) {
  const { media, title } = props;
  if (!media) return null;

  if (media.mediaType === "video") {
    const mediaId = parseApiMediaIdFromPlayableUrl(media.mediaUrl);
    if (!mediaId) {
      return (
        <div className="relative flex aspect-video w-full shrink-0 items-center justify-center bg-muted/30 px-3">
          <p className={cn(patientMutedTextClass, "text-center text-sm")}>
            Видео без привязки к медиатеке нельзя воспроизвести здесь.
          </p>
        </div>
      );
    }
    const mp4Url = `/api/media/${encodeURIComponent(mediaId)}`;
    return (
      <PatientMediaPlaybackVideo
        mediaId={mediaId}
        mp4Url={mp4Url}
        title={title}
        initialPlayback={null}
        shellClassName="relative aspect-video w-full shrink-0 overflow-hidden bg-black"
      />
    );
  }

  const imgSrc = media.previewMdUrl ?? media.previewSmUrl ?? media.mediaUrl;
  return (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-muted/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgSrc} alt={title} className="h-full w-full object-contain" loading="eager" />
    </div>
  );
}

function ModalDescriptionSection(props: { item: StageItem }) {
  const { item } = props;
  const [collapsed, setCollapsed] = useState(false);
  const snap = item.snapshot as Record<string, unknown>;

  let text = "";
  let isMarkdown = false;

  if (item.itemType === "recommendation") {
    text = typeof snap.bodyMd === "string" ? snap.bodyMd.trim() : "";
    isMarkdown = true;
  } else if (item.itemType === "lesson") {
    text =
      typeof snap.bodyPreview === "string"
        ? snap.bodyPreview.trim()
        : typeof snap.summary === "string"
          ? snap.summary.trim()
          : "";
  } else {
    text = typeof snap.description === "string" ? snap.description.trim() : "";
  }

  if (!text) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className={patientSectionTitleClass}>Описание</h3>
      <div className={cn(collapsed && "line-clamp-6")}>
        {isMarkdown ? (
          <MarkdownContent
            text={text}
            bodyFormat="markdown"
            className={cn(
              "markdown-preview text-sm [&_p]:leading-relaxed",
              "text-[var(--patient-text-primary,#1a1a2e)]",
            )}
          />
        ) : (
          <p className={cn(patientBodyTextClass, "whitespace-pre-wrap leading-relaxed")}>{text}</p>
        )}
      </div>
      <div className="flex justify-end">
        <span
          role="button"
          tabIndex={0}
          className={cn(
            patientMutedTextClass,
            "cursor-pointer select-none text-xs hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary,#284da0)]",
          )}
          onClick={() => setCollapsed((c) => !c)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setCollapsed((c) => !c);
            }
          }}
        >
          {collapsed ? "развернуть" : "свернуть"}
        </span>
      </div>
    </div>
  );
}

function ModalLfkInlineForm(props: {
  row: PatientProgramChecklistRow;
  itemBaseUrl: string;
  done: boolean;
  onUpdated: (ids: string[]) => void;
  onAfterSave: () => void | Promise<void>;
  setError: (e: string | null) => void;
}) {
  const { row, itemBaseUrl, done, onUpdated, onAfterSave, setError } = props;
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div
      className={cn(patientFormSurfaceClass, "gap-3 border border-[var(--patient-border)]/70 p-3")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <p className="text-sm font-medium">{modalSnapshotTitle(row.item.snapshot, row.item.itemType)}</p>
      {row.groupTitle ? <p className={cn(patientMutedTextClass, "text-xs")}>{row.groupTitle}</p> : null}
      {done ? (
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
          Сегодня занятие уже отмечено — при необходимости добавьте ещё одну отметку ниже.
        </p>
      ) : null}
      <div className="mt-2 flex flex-col gap-2">
        <Label className={cn(patientMutedTextClass, "text-xs")}>Как прошло занятие?</Label>
        <Select
          value={difficulty}
          onValueChange={(v) => setDifficulty(v as "easy" | "medium" | "hard")}
          disabled={pending}
          items={patientLfkDifficultySelectItems}
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
      <div className="mt-2 flex flex-col gap-2">
        <Label htmlFor={`lfk-item-page-note-${row.item.id}`} className={cn(patientMutedTextClass, "text-xs")}>
          Заметка для врача
        </Label>
        <Textarea
          id={`lfk-item-page-note-${row.item.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          rows={3}
          className="min-h-[72px] resize-y text-sm"
          maxLength={4000}
        />
      </div>
      <button
        type="button"
        className={cn(patientCompactActionClass, "mt-2 h-9 w-fit text-sm")}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await fetch(`${itemBaseUrl}/${encodeURIComponent(row.item.id)}/progress/lfk-session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                difficulty,
                note: note.trim() || null,
                completedExerciseIds: listLfkSnapshotExerciseLines(
                  row.item.snapshot as Record<string, unknown>,
                ).map((l) => l.exerciseId),
              }),
            });
            const data = (await res.json().catch(() => null)) as {
              ok?: boolean;
              doneItemIds?: string[];
              error?: string;
            };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Ошибка сохранения");
              return;
            }
            if (data.doneItemIds) onUpdated(data.doneItemIds);
            setNote("");
            await onAfterSave();
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Сохраняю…" : done ? "Добавить отметку" : "Сохранить"}
      </button>
    </div>
  );
}

function ModalTestSetInline(props: {
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
  const testsMeta = useMemo(() => parseTestSetSnapshotTests(snapshot), [snapshot]);

  const [scores, setScores] = useState<Record<string, string>>({});
  const [qualDecisions, setQualDecisions] = useState<Record<string, NormalizedTestDecision | "">>({});
  const [qualNotes, setQualNotes] = useState<Record<string, string>>({});

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
    return <p className="text-xs text-emerald-600 dark:text-emerald-400">Набор тестов пройден.</p>;
  }

  return (
    <div
      className="mt-3 flex flex-col gap-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {testsMeta.length === 0 ? (
        <p className="text-xs text-destructive">В снимке нет списка тестов.</p>
      ) : (
        testsMeta.map((t) => {
          const autoFromScore = scoringAllowsNumericDecisionInference(t.scoringConfig);
          return (
            <div
              key={t.testId}
              className="flex flex-col gap-1 rounded-lg border border-[var(--patient-border)]/60 bg-[var(--patient-card-bg)] px-2 py-1.5"
            >
              <span className="text-xs font-medium">{t.title ?? t.testId}</span>
              {t.comment ? (
                <p className={cn(patientMutedTextClass, "mt-0.5 text-[11px]")}>
                  Комментарий к позиции: <span className="text-foreground">{t.comment}</span>
                </p>
              ) : null}
              {autoFromScore ? (
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
                  </button>
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
                      <SelectTrigger className="h-9 max-w-[280px] text-sm">
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
                      try {
                        if (!(await ensureAttempt())) return;
                        const d = qualDecisions[t.testId];
                        if (d !== "passed" && d !== "failed" && d !== "partial") {
                          setError("Выберите итог: зачтено, не зачтено или частично.");
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
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
      {testIds.length > 0 ? (
        <p className={cn(patientMutedTextClass, "text-[11px]")}>Тестов в наборе: {testIds.length}</p>
      ) : null}
    </div>
  );
}

export function PatientProgramStageItemPageClient(props: PatientProgramStageItemPageClientProps) {
  const { instanceId, itemId, navMode, backHref, initialDetail } = props;
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);
  const [testFormOpen, setTestFormOpen] = useState(false);

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items`;

  const navForPath = navMode === "default" ? undefined : navMode;

  const itemLink = useCallback(
    (id: string) => routePaths.patientTreatmentProgramItem(instanceId, id, navForPath),
    [instanceId, navForPath],
  );

  const currentWorkingStage = useMemo(() => {
    const { pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
    return selectCurrentWorkingStageForPatientDetail(pipeline);
  }, [detail.stages]);

  const resolved = useMemo(
    () =>
      resolvePatientProgramItemPage({
        detail,
        itemId,
        nav: navMode,
        currentWorkingStage,
      }),
    [detail, itemId, navMode, currentWorkingStage],
  );

  useEffect(() => {
    if (!resolved) router.replace(backHref);
  }, [resolved, router, backHref]);

  const refresh = useCallback(async () => {
    setError(null);
    const instRes = await fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}`);
    const data = (await instRes.json().catch(() => null)) as { ok?: boolean; item?: TreatmentProgramInstanceDetail };
    if (!instRes.ok || !data.ok || !data.item) {
      setError("Не удалось обновить данные");
      return;
    }
    setDetail(data.item);
    if (data.item.status === "active") {
      const chRes = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/checklist-today`,
      );
      const chData = (await chRes.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
      if (chRes.ok && chData?.ok && Array.isArray(chData.doneItemIds)) setDoneItemIds(chData.doneItemIds);
    } else {
      setDoneItemIds([]);
    }
  }, [instanceId]);

  useEffect(() => {
    if (detail.status !== "active") {
      setDoneItemIds([]);
      return;
    }
    void (async () => {
      const chRes = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/checklist-today`,
      );
      const chData = (await chRes.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
      if (chRes.ok && chData?.ok && Array.isArray(chData.doneItemIds)) setDoneItemIds(chData.doneItemIds);
    })();
  }, [detail.id, detail.status, instanceId]);

  useEffect(() => {
    setTestFormOpen(false);
  }, [itemId]);

  const stage = resolved?.stage;
  const item = resolved?.item;
  const flatOrderedIds = resolved?.flatOrderedIds ?? EMPTY_ORDERED_ITEM_IDS;
  const contentBlocked = resolved?.contentBlocked ?? false;
  const itemInteraction = resolved?.itemInteraction ?? "readOnly";
  const readOnly = itemInteraction === "readOnly";

  const nextId = useMemo(() => {
    if (!item) return null;
    const idx = flatOrderedIds.indexOf(item.id);
    return idx >= 0 && idx < flatOrderedIds.length - 1 ? flatOrderedIds[idx + 1]! : null;
  }, [flatOrderedIds, item]);

  const primaryMedia = useMemo(() => (item ? primaryMediaForStageItem(item) : null), [item]);

  const lfkRow = useMemo((): PatientProgramChecklistRow | null => {
    if (!item || !stage || item.itemType !== "lfk_complex") return null;
    const groupTitle =
      item.groupId == null ? null : stage.groups.find((g) => g.id === item.groupId)?.title ?? null;
    return {
      stageId: stage.id,
      stageTitle: stage.title,
      stageSortOrder: stage.sortOrder,
      groupId: item.groupId,
      groupTitle,
      item,
    };
  }, [item, stage]);

  const title = item ? modalSnapshotTitle(item.snapshot as Record<string, unknown>, item.itemType) : "";

  const handleComplete = async () => {
    if (!item) return;
    setBusy(item.id);
    setError(null);
    try {
      const res = await fetch(`${base}/${encodeURIComponent(item.id)}/progress/complete`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Ошибка");
        return;
      }
      await refresh();
      if (nextId) router.push(itemLink(nextId));
      else router.push(backHref);
    } finally {
      setBusy(null);
    }
  };

  const currentIdx = flatOrderedIds.indexOf(item?.id ?? "");
  const prevId = item && currentIdx > 0 ? flatOrderedIds[currentIdx - 1]! : null;
  const positionLabel =
    item && flatOrderedIds.length > 1 ? `${currentIdx + 1} / ${flatOrderedIds.length}` : null;

  if (!resolved || !item || !stage) return null;

  const backLinkClass = cn(
    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold no-underline",
    "text-[var(--patient-color-primary,#284da0)] transition-colors",
    "hover:bg-[var(--patient-color-primary-soft,#e4e2ff)]/60 active:bg-[var(--patient-color-primary-soft,#e4e2ff)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary,#284da0)]",
  );

  const navButtonClass = (enabled: boolean) =>
    cn(
      "flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold outline-none transition-colors duration-150 no-underline",
      "bg-[#f8f3fd] text-[#444444]",
      enabled && "cursor-pointer hover:bg-[#ede8f8] active:bg-[#e4e2ff]",
      enabled && "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--patient-color-primary,#284da0)]",
      !enabled && "pointer-events-none opacity-40",
    );

  return (
    <div id="app-shell-patient" className="flex min-h-[100dvh] flex-col bg-[var(--patient-card-bg,#fff)]">
      {error ? (
        <p className="px-4 pt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          patientHomeCardHeroClass,
          "relative shrink-0 overflow-visible rounded-none px-4 pb-4 pt-3 lg:px-5 lg:pb-5",
        )}
      >
        <div className="flex items-center gap-2">
          <Link href={backHref} className={backLinkClass} aria-label="Назад к плану">
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
            <span className="sr-only sm:not-sr-only">Назад</span>
          </Link>
          <div className="min-w-0 flex-1" />
        </div>

        <h1
          className={cn(
            patientHeroTitleBaseClass,
            patientInnerHeroTitleTypographyClass,
            "mt-2 line-clamp-3 pr-2",
          )}
        >
          {title}
        </h1>

        {(() => {
          const parts = formatCharacteristics(item);
          if (parts.length === 0) return null;
          return (
            <p className={cn(patientMutedTextClass, "mt-2 text-sm leading-snug")}>{parts.join(" · ")}</p>
          );
        })()}
      </div>

      <div
        className="sticky top-0 z-[5] flex shrink-0 items-stretch gap-px border-b border-[var(--patient-border,#ddd6fe)] bg-[var(--patient-border,#ddd6fe)] shadow-sm"
        aria-label="Навигация по элементам"
      >
        {prevId ? (
          <Link href={itemLink(prevId)} className={navButtonClass(true)} aria-label="Предыдущий элемент">
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            <span className="sr-only sm:not-sr-only text-xs">Пред.</span>
          </Link>
        ) : (
          <span className={navButtonClass(false)} aria-hidden>
            <ChevronLeft className="size-4 shrink-0 opacity-50" aria-hidden />
            <span className="sr-only sm:not-sr-only text-xs">Пред.</span>
          </span>
        )}

        {positionLabel ? (
          <div className="flex min-h-[2.75rem] items-center justify-center bg-[#f8f3fd] px-3 py-2 text-xs font-medium text-[#555555]">
            {positionLabel}
          </div>
        ) : null}

        {nextId ? (
          <Link href={itemLink(nextId)} className={navButtonClass(true)} aria-label="Следующий элемент">
            <span className="sr-only sm:not-sr-only text-xs">След.</span>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : (
          <span className={navButtonClass(false)} aria-hidden>
            <span className="sr-only sm:not-sr-only text-xs">След.</span>
            <ChevronRight className="size-4 shrink-0 opacity-50" aria-hidden />
          </span>
        )}
      </div>

      <div
        className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", patientScrollbarHiddenClass)}
      >
        <ModalMediaBlock media={primaryMedia} title={title} />

        <div className={cn(patientInnerPageStackClass, "p-4 lg:p-5")}>
          {item.itemType === "lfk_complex" ? (
            <div>
              <h2 className={cn(patientSectionTitleClass, "mb-2")}>Состав комплекса</h2>
              <ul className={cn(patientMutedTextClass, "m-0 list-none space-y-1 p-0 text-sm")}>
                {listLfkSnapshotExerciseLines(item.snapshot as Record<string, unknown>).map((line) => (
                  <li key={line.exerciseId} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--patient-color-primary,#284da0)]/40"
                      aria-hidden
                    />
                    {line.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!contentBlocked && !readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              {isPersistentRecommendation(item) ? (
                nextId ? (
                  <Link
                    href={itemLink(nextId)}
                    className={cn(patientButtonSuccessClass, "min-h-[var(--patient-touch,44px)] flex-1 no-underline")}
                  >
                    Следующая рекомендация
                  </Link>
                ) : (
                  <Link
                    href={backHref}
                    className={cn(patientButtonSuccessClass, "min-h-[var(--patient-touch,44px)] flex-1 no-underline")}
                  >
                    Следующая рекомендация
                  </Link>
                )
              ) : item.itemType === "test_set" ? (
                <button
                  type="button"
                  className={cn(patientButtonPrimaryClass, "min-h-[var(--patient-touch,44px)] flex-1")}
                  onClick={() => setTestFormOpen(true)}
                  disabled={testFormOpen || Boolean(item.completedAt)}
                >
                  <ClipboardList className="size-4 shrink-0" aria-hidden />
                  Записать результаты теста
                </button>
              ) : item.itemType === "lfk_complex" && !isPersistentRecommendation(item) ? (
                nextId ? (
                  <Link
                    href={itemLink(nextId)}
                    className={cn(
                      patientButtonSkipClass,
                      "inline-flex min-h-[var(--patient-touch,44px)] w-full items-center justify-center no-underline sm:w-auto",
                    )}
                  >
                    <ArrowRight className="size-4 shrink-0" aria-hidden />
                    Пропустить
                  </Link>
                ) : null
              ) : (
                <>
                  <button
                    type="button"
                    className={cn(patientButtonPrimaryClass, "min-h-[var(--patient-touch,44px)] flex-1")}
                    disabled={busy !== null}
                    onClick={() => void handleComplete()}
                  >
                    <Check className="size-4 shrink-0" aria-hidden />
                    {item.completedAt ? "Отметить ещё раз" : "Отметить выполнение"}
                  </button>
                  {nextId ? (
                    <Link
                      href={itemLink(nextId)}
                      className={cn(
                        patientButtonSkipClass,
                        "inline-flex min-h-[var(--patient-touch,44px)] shrink-0 items-center justify-center gap-1.5 no-underline",
                      )}
                    >
                      <ArrowRight className="size-4 shrink-0" aria-hidden />
                      Пропустить
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <ModalDescriptionSection item={item} />

          {item.itemType === "lfk_complex" &&
          lfkRow &&
          !isPersistentRecommendation(item) &&
          !contentBlocked &&
          !readOnly ? (
            <ModalLfkInlineForm
              row={lfkRow}
              itemBaseUrl={base}
              done={doneItemIds.includes(item.id)}
              onUpdated={(ids) => setDoneItemIds(ids)}
              onAfterSave={refresh}
              setError={setError}
            />
          ) : null}

          {item.itemType === "test_set" && testFormOpen && !contentBlocked && !readOnly ? (
            <ModalTestSetInline
              itemId={item.id}
              snapshot={item.snapshot as Record<string, unknown>}
              completed={Boolean(item.completedAt)}
              baseUrl={base}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onDone={refresh}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
