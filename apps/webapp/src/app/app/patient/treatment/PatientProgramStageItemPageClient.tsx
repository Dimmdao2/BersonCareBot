"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Camera, ChevronLeft, ChevronRight } from "lucide-react";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";
import {
  isPersistentRecommendation,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import { routePaths } from "@/app-layer/routes/paths";
import { treatmentProgramItemToRatingTarget } from "@/modules/material-rating/mapProgramItemToTarget";
import { MaterialRatingBlock } from "@/shared/ui/patient/material-rating/MaterialRatingBlock";
import type { PatientProgramItemNavMode } from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import type { PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { resolvePatientProgramItemPage } from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import { MarkdownContent } from "@/shared/ui/patient/markdown/MarkdownContent";
import { PatientMediaPlaybackVideo } from "@/shared/ui/patient/media/PatientMediaPlaybackVideo";
import { parseApiMediaIdFromPlayableUrl } from "@/shared/lib/parseApiMediaIdFromPlayableUrl";
import {
  mergeLastActivityDisplayedIso,
  patientExerciseLoadTypeLabelRu,
  primaryMediaForStageItem,
  primaryMediaForTestSnapshotLine,
  testTitleFromTestSetSnapshot,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import {
  isItemDoneCooldownActive,
  planItemDoneRepeatCooldownMsFromMinutes,
} from "@/modules/treatment-program/itemDoneCooldown";
import { patientHomeCardHeroClass } from "@/app/app/patient/home/patientHomeCardStyles";
import {
  patientBodyTextClass,
  patientButtonPrimaryClass,
  patientButtonSuccessClass,
  patientMutedTextClass,
  patientProgramItemHeroTitleClass,
  patientProgramItemPrimaryStatTextClass,
  patientInnerPageStackClass,
  patientScrollbarHiddenClass,
  patientSectionTitleClass,
  patientSectionTitleNormalClass,
  patientSimpleCompleteDoneButtonToneClass,
} from "@/shared/ui/patient/patientVisual";
import { cn } from "@/lib/utils";
import {
  PATIENT_SHELL_CONTAINER_CLASS,
  PATIENT_SHELL_MOBILE_MAX_CLASS,
  patientShellMaxWidthDataAttribute,
} from "@/shared/ui/patient/pwaLayoutClasses";
import {
  normalizeChecklistCountMap,
  normalizeChecklistLastMap,
} from "@/app/app/patient/treatment/normalizeTreatmentProgramChecklistMaps";
import { PatientStageCompositionList } from "@/app/app/patient/treatment/PatientStageCompositionList";
import { PatientTestSetProgressForm } from "@/app/app/patient/treatment/PatientTestSetProgressForm";
import type { PatientTestSetPageServerSnapshot } from "@/modules/treatment-program/progress-service";
import {
  ProgramItemSubmissionSourceDialog,
  type ProgramItemSubmissionSourceDialogHandle,
} from "@/app/app/patient/treatment/ProgramItemSubmissionSourceDialog";
import { ProgramItemDiscussionDialog } from "@/app/app/patient/treatment/ProgramItemDiscussionDialog";
import {
  CompletionMetricsPanel,
  DEFAULT_COMPLETION_METRICS_DRAFT,
  draftToPayload,
  metricNumberToInput,
  type CompletionDifficulty,
  type CompletionMetricsDraft,
} from "@/app/app/patient/treatment/PatientTreatmentProgramStagePageProgramSection";
import { PatientProgramItemExecutionRow } from "@/app/app/patient/treatment/PatientProgramItemExecutionRow";
import { postProgramItemComplete } from "@/app/app/patient/treatment/postProgramItemComplete";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";

const EMPTY_ORDERED_ITEM_IDS: string[] = [];

export type PatientProgramStageItemPageClientProps = {
  instanceId: string;
  itemId: string;
  navMode: PatientProgramItemNavMode;
  backHref: string;
  initialDetail: TreatmentProgramInstanceDetail;
  appDisplayTimeZone: string;
  /** RSC: начальные данные тест-набора без лишнего round-trip. */
  testSetServerSnapshot?: PatientTestSetPageServerSnapshot | null;
  /** Вкладка плана для prev/next и `planTab` в URL пункта. */
  itemLinksPlanTab?: PatientPlanTab | null;
  /** Для `nav=tests`: выбранный тест (канонический URL с `testId`). */
  resolvedTestId?: string | null;
  /** Пауза перед повторным «Выполнено» у простых пунктов (мин), из `system_settings`. */
  planItemDoneRepeatCooldownMinutes: number;
  programCommentsInteraction: { visible: boolean; enabled: boolean };
  programMediaInteraction: { visible: boolean; enabled: boolean };
};

type StageItem = TreatmentProgramInstanceDetail["stages"][number]["items"][number];

type ItemDiscussionLastDoneSummary = {
  createdAt: string;
  reps: number | null;
  sets?: number | null;
  weightKg: number | null;
  perceivedDifficulty: "easy" | "medium" | "hard" | null;
};

type ItemDiscussionPreview = {
  totalCount: number;
  unreadCount: number;
  lastMessage: ProgramItemDiscussionMessage | null;
  lastDoneSummary: ItemDiscussionLastDoneSummary | null;
};

function modalSnapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

function trimSnapshotString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Текст описания пункта «упражнение»: каталог и снимок дают `description`; остальное — запасные поля / старые снимки. */
function exerciseSnapshotDescriptionBody(snap: Record<string, unknown>): string {
  return (
    trimSnapshotString(snap.description) ||
    trimSnapshotString(snap.bodyMd) ||
    trimSnapshotString(snap.bodyPreview) ||
    trimSnapshotString(snap.summary)
  );
}

/** Краткая строка под заголовком для типов, кроме упражнения (у exercise — отдельная вёрстка). */
function briefNonExerciseHeroParts(item: StageItem, navMode: PatientProgramItemNavMode): string[] {
  const snap = item.snapshot as Record<string, unknown>;
  const parts: string[] = [];
  if (item.itemType === "recommendation") {
    if (typeof snap.durationText === "string" && snap.durationText.trim()) parts.push(snap.durationText.trim());
    if (typeof snap.frequencyText === "string" && snap.frequencyText.trim()) parts.push(snap.frequencyText.trim());
    if (typeof snap.quantityText === "string" && snap.quantityText.trim()) parts.push(snap.quantityText.trim());
  }
  if (item.itemType === "clinical_test" && navMode !== "tests") {
    const tests = parseTestSetSnapshotTests(snap);
    if (tests.length > 0) parts.push(`Тестов в пункте: ${tests.length}`);
  }
  if (item.itemType === "lesson") {
    if (typeof snap.summary === "string" && snap.summary.trim()) parts.push(snap.summary.trim());
  }
  return parts;
}

function pickFirstFiniteNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

const ITEM_MAX_TODAY_DOTS = 24;

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
  const snap = item.snapshot as Record<string, unknown>;

  if (item.itemType === "exercise") {
    const body = exerciseSnapshotDescriptionBody(snap);
    const contraindications = trimSnapshotString(snap.contraindications);
    if (!body && !contraindications) return null;
    if (!body && contraindications) {
      return (
        <div className="flex flex-col gap-2">
          <h3 className={patientSectionTitleNormalClass}>Противопоказания</h3>
          <p className={cn(patientBodyTextClass, "m-0 whitespace-pre-wrap leading-relaxed")}>
            {contraindications}
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <h3 className={patientSectionTitleNormalClass}>Описание</h3>
        <div className="flex flex-col gap-3">
          {body ? (
            <p className={cn(patientBodyTextClass, "m-0 whitespace-pre-wrap leading-relaxed")}>{body}</p>
          ) : null}
          {contraindications ? (
            <div className="flex flex-col gap-1">
              <span className={cn(patientMutedTextClass, "text-xs font-medium")}>Противопоказания</span>
              <p className={cn(patientBodyTextClass, "m-0 whitespace-pre-wrap leading-relaxed")}>
                {contraindications}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

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
      <h3 className={patientSectionTitleNormalClass}>Описание</h3>
      <div>
        {isMarkdown ? (
          <MarkdownContent
            text={text}
            bodyFormat="markdown"
            className={cn(
              "markdown-preview text-sm [&_p]:leading-relaxed [&_strong]:font-normal",
              "text-[var(--patient-text-primary,#1a1a2e)]",
            )}
          />
        ) : (
          <p className={cn(patientBodyTextClass, "whitespace-pre-wrap leading-relaxed")}>{text}</p>
        )}
      </div>
    </div>
  );
}

export function PatientProgramStageItemPageClient(props: PatientProgramStageItemPageClientProps) {
  const {
    instanceId,
    itemId,
    navMode,
    backHref,
    initialDetail,
    appDisplayTimeZone,
    testSetServerSnapshot,
    itemLinksPlanTab = null,
    resolvedTestId = null,
    planItemDoneRepeatCooldownMinutes,
    programCommentsInteraction,
    programMediaInteraction,
  } = props;
  const router = useRouter();
  const planItemDoneRepeatCooldownMs = useMemo(
    () => planItemDoneRepeatCooldownMsFromMinutes(planItemDoneRepeatCooldownMinutes),
    [planItemDoneRepeatCooldownMinutes],
  );
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);
  const [doneTodayCountByItemId, setDoneTodayCountByItemId] = useState<Record<string, number>>({});
  const [lastDoneAtIsoByItemId, setLastDoneAtIsoByItemId] = useState<Record<string, string>>({});
  const [doneTodayCountByActivityKey, setDoneTodayCountByActivityKey] = useState<Record<string, number>>({});
  const [lastDoneAtIsoByActivityKey, setLastDoneAtIsoByActivityKey] = useState<Record<string, string>>({});
  const mediaPickerRef = useRef<ProgramItemSubmissionSourceDialogHandle>(null);
  const [metricsDraft, setMetricsDraft] = useState<CompletionMetricsDraft>(DEFAULT_COMPLETION_METRICS_DRAFT);
  const [metricsPanelOpen, setMetricsPanelOpen] = useState(false);
  const [discussionPreview, setDiscussionPreview] = useState<ItemDiscussionPreview>({
    totalCount: 0,
    unreadCount: 0,
    lastMessage: null,
    lastDoneSummary: null,
  });
  const [discussionDialogOpen, setDiscussionDialogOpen] = useState(false);
  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items`;
  const canUseInteractiveProgramActions = detail.assignmentSource === "doctor";
  const commentsInteraction = programCommentsInteraction;
  const mediaInteraction = programMediaInteraction;
  const commentsVisible = canUseInteractiveProgramActions && commentsInteraction.visible;
  const commentsEnabled = canUseInteractiveProgramActions && commentsInteraction.enabled;
  const mediaPickerVisible = canUseInteractiveProgramActions && mediaInteraction.visible;
  const mediaPickerEnabled = canUseInteractiveProgramActions && mediaInteraction.enabled;

  const navForPath = navMode === "default" ? undefined : navMode;

  const itemLink = useCallback(
    (id: string) => routePaths.patientTreatmentProgramItem(instanceId, id, navForPath, itemLinksPlanTab ?? null),
    [instanceId, navForPath, itemLinksPlanTab],
  );

  const itemLinkTestSlot = useCallback(
    (slotItemId: string, testId: string) =>
      routePaths.patientTreatmentProgramItem(instanceId, slotItemId, "tests", itemLinksPlanTab ?? null, testId),
    [instanceId, itemLinksPlanTab],
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
        testId: navMode === "tests" ? resolvedTestId : null,
      }),
    [detail, itemId, navMode, currentWorkingStage, resolvedTestId],
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
      const chData = (await chRes.json().catch(() => null)) as {
        ok?: boolean;
        doneItemIds?: string[];
        doneTodayCountByItemId?: unknown;
        lastDoneAtIsoByItemId?: unknown;
        doneTodayCountByActivityKey?: unknown;
        lastDoneAtIsoByActivityKey?: unknown;
      };
      if (chRes.ok && chData?.ok && Array.isArray(chData.doneItemIds)) {
        setDoneItemIds(chData.doneItemIds);
        setDoneTodayCountByItemId(normalizeChecklistCountMap(chData.doneTodayCountByItemId));
        setLastDoneAtIsoByItemId(normalizeChecklistLastMap(chData.lastDoneAtIsoByItemId));
        setDoneTodayCountByActivityKey(normalizeChecklistCountMap(chData.doneTodayCountByActivityKey));
        setLastDoneAtIsoByActivityKey(normalizeChecklistLastMap(chData.lastDoneAtIsoByActivityKey));
      }
    } else {
      setDoneItemIds([]);
      setDoneTodayCountByItemId({});
      setLastDoneAtIsoByItemId({});
      setDoneTodayCountByActivityKey({});
      setLastDoneAtIsoByActivityKey({});
    }
  }, [instanceId]);

  useEffect(() => {
    if (detail.status !== "active") {
      setDoneItemIds([]);
      setDoneTodayCountByItemId({});
      setLastDoneAtIsoByItemId({});
      setDoneTodayCountByActivityKey({});
      setLastDoneAtIsoByActivityKey({});
      return;
    }
    void (async () => {
      const chRes = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/checklist-today`,
      );
      const chData = (await chRes.json().catch(() => null)) as {
        ok?: boolean;
        doneItemIds?: string[];
        doneTodayCountByItemId?: unknown;
        lastDoneAtIsoByItemId?: unknown;
        doneTodayCountByActivityKey?: unknown;
        lastDoneAtIsoByActivityKey?: unknown;
      };
      if (chRes.ok && chData?.ok && Array.isArray(chData.doneItemIds)) {
        setDoneItemIds(chData.doneItemIds);
        setDoneTodayCountByItemId(normalizeChecklistCountMap(chData.doneTodayCountByItemId));
        setLastDoneAtIsoByItemId(normalizeChecklistLastMap(chData.lastDoneAtIsoByItemId));
        setDoneTodayCountByActivityKey(normalizeChecklistCountMap(chData.doneTodayCountByActivityKey));
        setLastDoneAtIsoByActivityKey(normalizeChecklistLastMap(chData.lastDoneAtIsoByActivityKey));
      }
    })();
  }, [detail.id, detail.status, instanceId]);

  const stage = resolved?.stage;
  const item = resolved?.item;
  const flatOrderedIds = resolved?.flatOrderedIds ?? EMPTY_ORDERED_ITEM_IDS;
  const testSlots = resolved?.testSlots;
  const contentBlocked = resolved?.contentBlocked ?? false;
  const itemInteraction = resolved?.itemInteraction ?? "readOnly";
  const readOnly = itemInteraction === "readOnly";

  const lastIsoForSimpleComplete =
    item ? mergeLastActivityDisplayedIso(lastDoneAtIsoByItemId[item.id], item.completedAt) : null;
  const simpleCompleteDoneFrozen = isItemDoneCooldownActive(lastIsoForSimpleComplete, planItemDoneRepeatCooldownMs);
  /* Скрыто: подпись «Можно отметить повторно…» — при возврате раскомментировать и вернуть импорт
     `formatPlanItemDoneCooldownCaption`, `itemDoneCooldownMinutesRemaining` и блок ниже.
  const simpleCompleteCooldownMinutes = itemDoneCooldownMinutesRemaining(
    lastIsoForSimpleComplete,
    planItemDoneRepeatCooldownMs,
  );
  */

  const primaryMedia = useMemo(() => {
    if (!item) return null;
    if (navMode === "tests" && resolvedTestId) {
      return primaryMediaForTestSnapshotLine(item.snapshot as Record<string, unknown>, resolvedTestId);
    }
    return primaryMediaForStageItem(item);
  }, [item, navMode, resolvedTestId]);

  const title = useMemo(() => {
    if (!item) return "";
    if (navMode === "tests" && resolvedTestId) {
      const tt = testTitleFromTestSetSnapshot(item.snapshot as Record<string, unknown>, resolvedTestId);
      if (tt) return tt;
    }
    return modalSnapshotTitle(item.snapshot as Record<string, unknown>, item.itemType);
  }, [item, navMode, resolvedTestId]);

  const loadDiscussionPreview = useCallback(async () => {
    if (!commentsVisible || !item || contentBlocked) {
      setDiscussionPreview({ totalCount: 0, unreadCount: 0, lastMessage: null, lastDoneSummary: null });
      return;
    }
    try {
      const url = new URL(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(item.id)}/discussion`,
        window.location.origin,
      );
      url.searchParams.set("direction", "backward");
      url.searchParams.set("limit", "1");
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            totalCount?: number;
            unreadCount?: number;
            lastMessage?: ProgramItemDiscussionMessage | null;
            lastDoneSummary?: ItemDiscussionLastDoneSummary | null;
          }
        | null;
      if (!res.ok || !data?.ok) {
        setDiscussionPreview({ totalCount: 0, unreadCount: 0, lastMessage: null, lastDoneSummary: null });
        return;
      }
      setDiscussionPreview({
        totalCount:
          typeof data.totalCount === "number" && Number.isFinite(data.totalCount) && data.totalCount > 0
            ? Math.floor(data.totalCount)
            : 0,
        unreadCount:
          typeof data.unreadCount === "number" && Number.isFinite(data.unreadCount) && data.unreadCount > 0
            ? Math.floor(data.unreadCount)
            : 0,
        lastMessage: data.lastMessage ?? null,
        lastDoneSummary: data.lastDoneSummary ?? null,
      });
    } catch {
      setDiscussionPreview({ totalCount: 0, unreadCount: 0, lastMessage: null, lastDoneSummary: null });
    }
  }, [commentsVisible, contentBlocked, instanceId, item]);

  useEffect(() => {
    void loadDiscussionPreview();
  }, [loadDiscussionPreview]);

  const loadLatestMetrics = useCallback(async (): Promise<CompletionMetricsDraft> => {
    if (!item || !canUseInteractiveProgramActions) return DEFAULT_COMPLETION_METRICS_DRAFT;
    try {
      const res = await fetch(`${base}/${encodeURIComponent(item.id)}/progress/complete/metrics`);
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        metrics?: {
          perceivedDifficulty?: CompletionDifficulty | null;
          difficulty?: CompletionDifficulty | null;
          reps?: number | null;
          sets?: number | null;
          weightKg?: number | null;
        } | null;
      } | null;
      const m = res.ok && data?.ok ? data.metrics : null;
      return {
        ...DEFAULT_COMPLETION_METRICS_DRAFT,
        perceivedDifficulty: m?.difficulty ?? m?.perceivedDifficulty ?? "medium",
        repsRaw: metricNumberToInput(m?.reps),
        setsRaw: metricNumberToInput(m?.sets),
        weightRaw: metricNumberToInput(m?.weightKg, true),
      };
    } catch {
      return DEFAULT_COMPLETION_METRICS_DRAFT;
    }
  }, [base, canUseInteractiveProgramActions, item]);

  useEffect(() => {
    setMetricsPanelOpen(false);
    setMetricsDraft(DEFAULT_COMPLETION_METRICS_DRAFT);
  }, [itemId]);

  const handleComplete = async () => {
    if (!item || !canUseInteractiveProgramActions || simpleCompleteDoneFrozen) return;
    setMetricsPanelOpen(true);
    setMetricsDraft({ ...DEFAULT_COMPLETION_METRICS_DRAFT, loading: true });
    setBusy(item.id);
    setError(null);
    try {
      const previousDraft = await loadLatestMetrics();
      const result = await postProgramItemComplete({
        base,
        itemId: item.id,
      });
      if (!result.ok) {
        setError(result.error);
        setMetricsPanelOpen(false);
        return;
      }
      if (result.item) {
        setDetail(result.item);
        const updatedItem = result.item.stages.flatMap((s) => s.items).find((x) => x.id === item.id) ?? null;
        const completedAt = updatedItem?.completedAt ?? new Date().toISOString();
        setDoneItemIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
        setLastDoneAtIsoByItemId((prev) => ({ ...prev, [item.id]: completedAt }));
        setDoneTodayCountByItemId((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
      }
      setMetricsDraft(previousDraft);
      await refresh();
      await loadDiscussionPreview();
    } finally {
      setBusy(null);
    }
  };

  const saveCompletionMetrics = async () => {
    if (!item || !canUseInteractiveProgramActions) return;
    setMetricsDraft((prev) => ({ ...prev, saving: true }));
    setError(null);
    try {
      const payload = draftToPayload(metricsDraft);
      const res = await fetch(`${base}/${encodeURIComponent(item.id)}/progress/complete/metrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Не удалось сохранить значения");
        return;
      }
      setMetricsPanelOpen(false);
      await refresh();
      await loadDiscussionPreview();
    } finally {
      setMetricsDraft((prev) => ({ ...prev, saving: false }));
    }
  };

  let navPrevHref: string | null = null;
  let navNextHref: string | null = null;
  let navPositionLabel: string | null = null;
  let navEnabled = false;

  if (navMode === "tests" && testSlots && testSlots.length > 0 && item && resolvedTestId) {
    const n = testSlots.length;
    const idx = testSlots.findIndex((s) => s.itemId === item.id && s.testId === resolvedTestId);
    if (idx >= 0) {
      navEnabled = true;
      const prevS = testSlots[(idx - 1 + n) % n]!;
      const nextS = testSlots[(idx + 1) % n]!;
      navPrevHref = itemLinkTestSlot(prevS.itemId, prevS.testId);
      navNextHref = itemLinkTestSlot(nextS.itemId, nextS.testId);
      navPositionLabel = n > 1 ? `${idx + 1} / ${n}` : null;
    }
  } else {
    const nNav = flatOrderedIds.length;
    const currentIdx = item ? flatOrderedIds.indexOf(item.id) : -1;
    if (item && nNav > 0 && currentIdx >= 0) {
      navEnabled = true;
      const prevId = flatOrderedIds[(currentIdx - 1 + nNav) % nNav]!;
      const nextId = flatOrderedIds[(currentIdx + 1) % nNav]!;
      navPrevHref = itemLink(prevId);
      navNextHref = itemLink(nextId);
      navPositionLabel = nNav > 1 ? `${currentIdx + 1} / ${nNav}` : null;
    }
  }

  const flatNextItemId =
    navMode !== "tests" && item && flatOrderedIds.length > 0
      ? (() => {
          const nNav = flatOrderedIds.length;
          const currentIdx = flatOrderedIds.indexOf(item.id);
          if (currentIdx < 0) return null;
          return flatOrderedIds[(currentIdx + 1) % nNav]!;
        })()
      : null;

  if (!resolved || !item || !stage) return null;

  const heroCloseLinkClass = cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#94a3b8]/28",
    "bg-[rgba(157,177,226,0.21)] px-3 py-1 text-xs font-normal leading-tight text-[#334155] no-underline transition-colors",
    "hover:border-[#94a3b8]/42 hover:bg-[rgba(157,177,226,0.30)] active:bg-[rgba(157,177,226,0.34)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94a3b8]/40",
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
    <div
      id="app-shell-patient"
      {...patientShellMaxWidthDataAttribute()}
      className={cn(
        PATIENT_SHELL_CONTAINER_CLASS,
        PATIENT_SHELL_MOBILE_MAX_CLASS,
        "bg-[var(--patient-card-bg,#fff)]",
      )}
    >
      {error ? (
        <p className="px-4 pt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          patientHomeCardHeroClass,
          "relative shrink-0 overflow-visible rounded-none px-4 pt-3 lg:px-5",
          item.itemType === "exercise" ? "pb-1.5 lg:pb-[10px]" : "pb-4 lg:pb-5",
        )}
      >
        <div className="flex min-h-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {item.groupId ? (
              <p className="m-0 truncate text-xs font-normal leading-snug text-muted-foreground">
                Группа:{" "}
                {stage.groups.find((g) => g.id === item.groupId)?.title?.trim() ?? "—"}
              </p>
            ) : null}
          </div>
          <Link href={backHref} className={heroCloseLinkClass} aria-label="Закрыть экран элемента">
            Закрыть
          </Link>
        </div>

        <h1 className={cn(patientProgramItemHeroTitleClass, "mt-[18px] line-clamp-3")}>
          {title}
        </h1>

        {item.itemType === "exercise" ? (
          (() => {
            const snap = item.snapshot as Record<string, unknown>;
            const ov =
              item.settings != null && typeof item.settings === "object" && !Array.isArray(item.settings)
                ? (item.settings as Record<string, unknown>)
                : {};
            const dRaw = ov.difficulty ?? snap.difficulty;
            const diffLine =
              typeof dRaw === "number" && Number.isFinite(dRaw)
                ? `Сложность ${dRaw}/10`
                : typeof dRaw === "string" && dRaw.trim()
                  ? `Сложность: ${dRaw.trim()}`
                  : null;
            const loadLabel = patientExerciseLoadTypeLabelRu(snap.loadType);
            const loadLine = loadLabel ? `Тип нагрузки: ${loadLabel}` : null;
            const reps = pickFirstFiniteNum(ov.reps, snap.reps);
            const sets = pickFirstFiniteNum(ov.sets, snap.sets);
            const maxPain = pickFirstFiniteNum(ov.maxPain, snap.maxPain);
            const metaLine = [diffLine, loadLine].filter(Boolean).join(" · ");
            return (
              <>
                {metaLine ? (
                  <p className="mt-2 text-[13px] font-normal leading-snug text-neutral-700">{metaLine}</p>
                ) : null}
                {reps != null && sets != null ? (
                  <div className="mt-[28px] flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[0.8rem]">
                    <span className={patientProgramItemPrimaryStatTextClass}>
                      {reps} повторений × {sets} подходов
                    </span>
                    {maxPain != null ? (
                      <span className="font-normal text-[#7d4128]">Боль {maxPain} max</span>
                    ) : null}
                  </div>
                ) : maxPain != null ? (
                  <p className="mt-[28px] text-[0.8rem] font-normal leading-snug text-[#7d4128]">
                    Боль {maxPain} max
                  </p>
                ) : null}
              </>
            );
          })()
        ) : (
          (() => {
            const parts = briefNonExerciseHeroParts(item, navMode);
            if (parts.length === 0) return null;
            return <p className={cn(patientMutedTextClass, "mt-2 text-sm leading-snug")}>{parts.join(" · ")}</p>;
          })()
        )}
      </div>

      <div
        className="sticky top-0 z-[5] flex shrink-0 items-stretch gap-px border-b border-[var(--patient-border,#ddd6fe)] bg-[var(--patient-border,#ddd6fe)] shadow-sm"
        aria-label="Навигация по элементам"
      >
        {item && navEnabled && navPrevHref ? (
          <Link href={navPrevHref} className={navButtonClass(true)} aria-label="Предыдущий элемент">
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            <span className="sr-only sm:not-sr-only text-xs">Пред.</span>
          </Link>
        ) : (
          <span className={navButtonClass(false)} aria-hidden>
            <ChevronLeft className="size-4 shrink-0 opacity-50" aria-hidden />
            <span className="sr-only sm:not-sr-only text-xs">Пред.</span>
          </span>
        )}

        {navPositionLabel ? (
          <div className="flex min-h-[2.75rem] items-center justify-center bg-[#f8f3fd] px-3 py-2 text-xs font-medium text-[#555555]">
            {navPositionLabel}
          </div>
        ) : null}

        {item && navEnabled && navNextHref ? (
          <Link href={navNextHref} className={navButtonClass(true)} aria-label="Следующий элемент">
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

        {navMode === "tests" && resolvedTestId ? (
          (() => {
            const line = parseTestSetSnapshotTests(item.snapshot as Record<string, unknown>).find(
              (t) => t.testId === resolvedTestId,
            );
            if (!line?.comment) return null;
            return (
              <div className="border-b border-[var(--patient-border)]/50 bg-muted/10 px-4 py-2.5 lg:px-5">
                <p className={cn(patientMutedTextClass, "m-0 text-xs leading-snug")}>
                  <span className="font-medium text-foreground">Комментарий к позиции: </span>
                  {line.comment}
                </p>
              </div>
            );
          })()
        ) : null}

        {(() => {
          const t = treatmentProgramItemToRatingTarget(item.itemType, item.itemRefId);
          if (!t.kind) return null;
          return (
            <div className="border-b border-[var(--patient-border)]/50 px-4 py-3 lg:px-5">
              <MaterialRatingBlock
                targetKind={t.kind}
                targetId={t.targetId}
                programInstanceId={instanceId}
                programStageItemId={item.id}
                readOnly={readOnly || contentBlocked}
                hideAfterSaved
              />
            </div>
          );
        })()}

        <div className={cn(patientInnerPageStackClass, "p-4 pb-8 lg:p-5 lg:pb-10")}>
          <div className="flex flex-col gap-0">
            {!contentBlocked && !readOnly && canUseInteractiveProgramActions && item.itemType !== "clinical_test" ? (
              <div className="flex flex-wrap items-stretch gap-2">
                {isPersistentRecommendation(item) ? (
                  flatNextItemId ? (
                    <Link
                      href={itemLink(flatNextItemId)}
                      className={cn(
                        patientButtonSuccessClass,
                        "min-h-9 flex-1 text-xs font-medium no-underline sm:min-h-10",
                      )}
                    >
                      Следующая рекомендация
                    </Link>
                  ) : (
                    <Link
                      href={backHref}
                      className={cn(
                        patientButtonSuccessClass,
                        "min-h-9 flex-1 text-xs font-medium no-underline sm:min-h-10",
                      )}
                    >
                      Следующая рекомендация
                    </Link>
                  )
                ) : (
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    <div className="flex w-full min-w-0 items-stretch gap-2">
                      {commentsVisible ? (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex min-h-9 min-w-0 flex-[0.9] items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium leading-tight transition-colors sm:min-h-10",
                            commentsEnabled
                              ? "cursor-pointer border-[var(--patient-border)] bg-[var(--patient-card-bg)] text-[var(--patient-text-primary)] hover:bg-muted/50 active:bg-muted/70"
                              : "cursor-not-allowed opacity-60",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary,#284da0)]",
                          )}
                          disabled={busy !== null || !commentsEnabled}
                          aria-disabled={!commentsEnabled}
                          onClick={() => {
                            if (!commentsEnabled) return;
                            setError(null);
                            setDiscussionDialogOpen(true);
                          }}
                        >
                          <span className="min-w-0 truncate">Комментарии</span>
                          {discussionPreview.totalCount > 0 ? (
                            <span className="rounded-md border border-[#60a5fa]/70 bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#1d4ed8]">
                              {discussionPreview.totalCount}
                            </span>
                          ) : null}
                          {discussionPreview.unreadCount > 0 ? (
                            <span className="size-1.5 shrink-0 rounded-full bg-[#ef4444]" aria-label="Есть новые комментарии" />
                          ) : null}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={cn(
                          patientButtonPrimaryClass,
                          "min-h-9 min-w-0 flex-1 py-2.5 text-xs font-medium leading-tight sm:min-h-10",
                          !commentsVisible && "w-full",
                          simpleCompleteDoneFrozen && cn(patientSimpleCompleteDoneButtonToneClass, "gap-1 disabled:cursor-default"),
                        )}
                        disabled={busy !== null || simpleCompleteDoneFrozen}
                        onClick={() => {
                          if (simpleCompleteDoneFrozen) return;
                          void handleComplete();
                        }}
                      >
                        {simpleCompleteDoneFrozen ? (
                          <>
                            <Check className="mr-[-20px] size-4 shrink-0 stroke-[2.75] text-current" aria-hidden />
                            <span className="min-w-0 flex-1 text-center font-semibold leading-tight">Выполнено</span>
                          </>
                        ) : (
                          <span className="w-full text-center leading-tight">Отметить выполнение</span>
                        )}
                      </button>
                    </div>
                    {metricsPanelOpen ? (
                      <CompletionMetricsPanel
                        draft={metricsDraft}
                        onDraftChange={setMetricsDraft}
                        onSave={() => void saveCompletionMetrics()}
                      />
                    ) : null}
                  </div>
                )}
            </div>
          ) : null}

            <PatientProgramItemExecutionRow
              lastIso={mergeLastActivityDisplayedIso(lastDoneAtIsoByItemId[item.id], item.completedAt)}
              todayCount={doneTodayCountByItemId[item.id] ?? 0}
              appDisplayTimeZone={appDisplayTimeZone}
              lastDoneSummary={discussionPreview.lastDoneSummary}
              variant="itemPage"
            />
          </div>

          {item.effectiveComment?.trim() ? (
            <div className="my-4 flex flex-col gap-1.5 rounded-lg border border-[var(--patient-border)]/60 bg-[#fff5e8] px-3 py-2.5">
              <span className="text-xs text-[#7e6c61]">Инструкция от специалиста</span>
              <p
                className={cn(
                  patientBodyTextClass,
                  "m-0 whitespace-pre-wrap text-sm leading-relaxed text-[#714c2f]",
                )}
              >
                {item.effectiveComment.trim()}
              </p>
            </div>
          ) : null}

          {mediaPickerVisible ? (
            <div className="my-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <button
                type="button"
                className={cn(
                  "inline-flex size-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors",
                  mediaPickerEnabled
                    ? "cursor-pointer hover:bg-slate-100 active:bg-slate-200"
                    : "cursor-not-allowed opacity-60",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300",
                )}
                disabled={busy !== null || !mediaPickerEnabled}
                aria-disabled={!mediaPickerEnabled}
                aria-label="Прикрепить видео"
                onClick={() => {
                  if (!mediaPickerEnabled) return;
                  queueMicrotask(() => mediaPickerRef.current?.open());
                }}
              >
                <Camera className="size-4" aria-hidden />
              </button>
              <p className={cn(patientMutedTextClass, "m-0 text-xs leading-snug")}>
                Если у вас есть вопросы по технике выполнения, вы можете записать небольшое видео с выполнением и отправить его специалисту.
              </p>
            </div>
          ) : null}

          {!(item.itemType === "clinical_test" && navMode === "tests") ? <ModalDescriptionSection item={item} /> : null}

          {item.itemType === "clinical_test" ? (
            <PatientTestSetProgressForm
              instanceId={instanceId}
              itemId={item.id}
              snapshot={item.snapshot as Record<string, unknown>}
              readOnlySummary={testSetServerSnapshot?.variant === "readonly_submitted"}
              interactionDisabled={contentBlocked || readOnly}
              baseUrl={base}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onDone={refresh}
              serverSnapshot={testSetServerSnapshot ?? null}
              activeTestId={navMode === "tests" && resolvedTestId ? resolvedTestId : undefined}
            />
          ) : null}

          {mediaPickerVisible ? (
            <ProgramItemSubmissionSourceDialog
              ref={mediaPickerRef}
              instanceId={instanceId}
              itemId={item.id}
              disabled={busy !== null || !mediaPickerEnabled}
              onUploaded={() => {
                void loadDiscussionPreview();
              }}
              onError={() => setError("Не удалось загрузить файл")}
            />
          ) : null}
          {commentsVisible && item ? (
            <ProgramItemDiscussionDialog
              instanceId={instanceId}
              itemId={item.id}
              open={discussionDialogOpen}
              mediaSubmissionEnabled={mediaPickerVisible && mediaPickerEnabled}
              onOpenChange={(open) => {
                setDiscussionDialogOpen(open);
                if (!open) {
                  void loadDiscussionPreview();
                }
              }}
              onRead={loadDiscussionPreview}
            />
          ) : null}
          {navMode === "program" || navMode === "exec" ? (
            <PatientStageCompositionList
              instanceId={instanceId}
              stage={stage}
              currentItemId={item.id}
              navMode={navMode}
              appDisplayTimeZone={appDisplayTimeZone}
              doneTodayCountByActivityKey={doneTodayCountByActivityKey}
              lastDoneAtIsoByActivityKey={lastDoneAtIsoByActivityKey}
              doneTodayCountByItemId={doneTodayCountByItemId}
              itemLinksPlanTab={itemLinksPlanTab ?? null}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
