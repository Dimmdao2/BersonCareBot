"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ArrowRight, Check, ClipboardList, XIcon } from "lucide-react";
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
import { isPersistentRecommendation } from "@/modules/treatment-program/stage-semantics";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { PatientMediaPlaybackVideo } from "@/shared/ui/media/PatientMediaPlaybackVideo";
import { parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import {
  parseSnapshotMediaForRowThumb,
  pickRecommendationRowPreviewMedia,
  primaryMediaForStageItem,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import {
  patientButtonPrimaryClass,
  patientButtonSkipClass,
  patientButtonSuccessClass,
  patientCompactActionClass,
  patientFormSurfaceClass,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

export type PatientProgramStageItemModalProps = {
  stage: TreatmentProgramInstanceDetail["stages"][number];
  base: string;
  item: TreatmentProgramInstanceDetail["stages"][number]["items"][number] | null;
  flatOrderedIds: string[];
  onClose: () => void;
  onNavigate: (itemId: string) => void;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  itemInteraction: "full" | "readOnly";
  doneItemIds: string[];
  onDoneItemIds: (ids: string[]) => void;
  contentBlocked: boolean;
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
  const [expanded, setExpanded] = useState(false);
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
    <div className="flex flex-col gap-1">
      <div className={cn(!expanded && "line-clamp-3")}>
        {isMarkdown ? (
          <MarkdownContent
            text={text}
            bodyFormat="markdown"
            className="markdown-preview text-sm text-[var(--patient-text-primary)] [&_p]:leading-relaxed"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--patient-text-primary)]">{text}</p>
        )}
      </div>
      <div className="flex justify-end">
        <span
          role="button"
          tabIndex={0}
          className={cn(
            patientMutedTextClass,
            "cursor-pointer select-none text-xs hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
          )}
          onClick={() => setExpanded((e) => !e)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((x) => !x);
            }
          }}
        >
          {expanded ? "свернуть" : "развернуть"}
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
        <Label htmlFor={`lfk-modal-note-${row.item.id}`} className={cn(patientMutedTextClass, "text-xs")}>
          Заметка для врача
        </Label>
        <Textarea
          id={`lfk-modal-note-${row.item.id}`}
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

export function PatientProgramStageItemModal(props: PatientProgramStageItemModalProps) {
  const {
    stage,
    base,
    item,
    flatOrderedIds,
    onClose,
    onNavigate,
    busy,
    setBusy,
    setError,
    refresh,
    itemInteraction,
    doneItemIds,
    onDoneItemIds,
    contentBlocked,
  } = props;

  const readOnly = itemInteraction === "readOnly";
  const [testFormOpen, setTestFormOpen] = useState(false);

  useEffect(() => {
    setTestFormOpen(false);
  }, [item?.id]);

  const nextId = useMemo(() => {
    if (!item) return null;
    const idx = flatOrderedIds.indexOf(item.id);
    return idx >= 0 && idx < flatOrderedIds.length - 1 ? flatOrderedIds[idx + 1]! : null;
  }, [flatOrderedIds, item]);

  const primaryMedia = useMemo(() => (item ? primaryMediaForStageItem(item) : null), [item]);

  const lfkRow = useMemo((): PatientProgramChecklistRow | null => {
    if (!item || item.itemType !== "lfk_complex") return null;
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
      if (nextId) onNavigate(nextId);
      else onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        {item ? (
          <>
            <DialogOverlay className="bg-black/70 backdrop-blur-sm" />
            <DialogPrimitive.Popup
              className={cn(
                "fixed inset-0 z-50 flex flex-col bg-background outline-none",
                "lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[min(92dvh,860px)] lg:w-[min(96vw,680px)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:shadow-2xl lg:ring-1 lg:ring-foreground/10",
                "duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              )}
            >
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--patient-border)] px-4 py-3 lg:px-5">
              <DialogTitle className="flex-1 text-base font-semibold leading-tight text-[var(--patient-text-primary)] line-clamp-2">
                {title}
              </DialogTitle>
              <DialogClose
                render={
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    aria-label="Закрыть"
                  />
                }
              >
                <XIcon className="size-5" aria-hidden />
              </DialogClose>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <ModalMediaBlock media={primaryMedia} title={title} />

              <div className="flex flex-col gap-4 p-4 lg:p-5">
                {item.itemType === "lfk_complex" ? (
                  <ul className={cn(patientMutedTextClass, "m-0 list-none space-y-1 p-0 text-sm")}>
                    {listLfkSnapshotExerciseLines(item.snapshot as Record<string, unknown>).map((line) => (
                      <li key={line.exerciseId}>{line.title}</li>
                    ))}
                  </ul>
                ) : null}

                {(() => {
                  const parts = formatCharacteristics(item);
                  if (parts.length === 0) return null;
                  return (
                    <p className={cn(patientMutedTextClass, "text-sm leading-snug")}>{parts.join(" · ")}</p>
                  );
                })()}

                {!contentBlocked && !readOnly ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {isPersistentRecommendation(item) ? (
                      <button
                        type="button"
                        className={cn(patientButtonSuccessClass, "min-h-[var(--patient-touch)] flex-1")}
                        onClick={() => (nextId ? onNavigate(nextId) : onClose())}
                      >
                        Следующая рекомендация
                      </button>
                    ) : item.itemType === "test_set" ? (
                      <button
                        type="button"
                        className={cn(patientButtonPrimaryClass, "min-h-[var(--patient-touch)] flex-1")}
                        onClick={() => setTestFormOpen(true)}
                        disabled={testFormOpen || Boolean(item.completedAt)}
                      >
                        <ClipboardList className="size-4 shrink-0" aria-hidden />
                        Записать результаты теста
                      </button>
                    ) : item.itemType === "lfk_complex" && !isPersistentRecommendation(item) ? (
                      nextId ? (
                        <button
                          type="button"
                          className={cn(patientButtonSkipClass, "min-h-[var(--patient-touch)] w-full sm:w-auto")}
                          disabled={busy !== null}
                          onClick={() => onNavigate(nextId)}
                        >
                          <ArrowRight className="size-4 shrink-0" aria-hidden />
                          Пропустить
                        </button>
                      ) : null
                    ) : (
                      <>
                        <button
                          type="button"
                          className={cn(patientButtonPrimaryClass, "min-h-[var(--patient-touch)] flex-1")}
                          disabled={busy !== null}
                          onClick={() => void handleComplete()}
                        >
                          <Check className="size-4 shrink-0" aria-hidden />
                          {item.completedAt ? "Отметить ещё раз" : "Отметить выполнение"}
                        </button>
                        {nextId ? (
                          <button
                            type="button"
                            className={cn(patientButtonSkipClass, "min-h-[var(--patient-touch)] shrink-0")}
                            disabled={busy !== null}
                            onClick={() => onNavigate(nextId)}
                          >
                            <ArrowRight className="size-4 shrink-0" aria-hidden />
                            Пропустить
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}

                <ModalDescriptionSection item={item} />

                {item.itemType === "lfk_complex" && lfkRow && !isPersistentRecommendation(item) && !contentBlocked && !readOnly ? (
                  <ModalLfkInlineForm
                    row={lfkRow}
                    itemBaseUrl={base}
                    done={doneItemIds.includes(item.id)}
                    onUpdated={onDoneItemIds}
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
            </DialogPrimitive.Popup>
          </>
        ) : null}
      </DialogPortal>
    </Dialog>
  );
}
