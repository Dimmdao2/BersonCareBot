"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, ClipboardList, ImageIcon, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoctorCatalogPersistPublishBar } from "@/shared/ui/doctor/DoctorCatalogPersistPublishBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { USAGE_CONFIRMATION_REQUIRED } from "@/modules/treatment-program/errors";
import {
  treatmentProgramGroupSelectNoneItemValue,
  treatmentProgramGroupSelectNoneLabel,
} from "@/shared/ui/selectOpaqueValueLabels";
import type {
  TreatmentProgramItemType,
  TreatmentProgramStageItem,
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateStageGroup,
  TreatmentProgramTemplateUsageRef,
  TreatmentProgramTemplateUsageSnapshot,
} from "@/modules/treatment-program/types";
import { doctorTreatmentProgramTemplateUsageHref } from "../templateUsageDocLinks";
import {
  isTreatmentProgramTemplateSystemStageGroup,
  sortDoctorTemplateStageGroupsForDisplay,
} from "@/modules/treatment-program/stage-semantics";
import {
  treatmentProgramTemplateUsageHasAnyReference,
  treatmentProgramTemplateUsageSections,
  type TreatmentProgramTemplateUsageSection,
} from "../templateUsageSummaryText";
import { TreatmentProgramTemplateStatusBadge } from "../TreatmentProgramTemplateStatusBadge";
import { TemplateReorderChevrons } from "@/shared/ui/doctor/TemplateReorderChevrons";
import { cn } from "@/lib/utils";
import {
  TPL_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS,
  TPL_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS,
  TPL_HEADER_BG_GROUP_CUSTOM,
  TPL_HEADER_BG_GROUP_TESTS,
  TPL_HEADER_BG_RECOMMENDATIONS,
  TPL_HEADER_BG_STAGE_EDITABLE,
  tplToolbarTextBtnClass,
} from "@/app/app/doctor/treatment-program-shared/treatmentProgramConstructorShellStyles";

const ITEM_TYPE_LABEL: Record<TreatmentProgramItemType, string> = {
  exercise: "Упражнение ЛФК",
  lfk_complex: "Комплекс ЛФК",
  recommendation: "Рекомендация",
  lesson: "Урок (страница контента)",
  test_set: "Набор тестов",
};

/** Квадратная кнопка «+»: открыть выбор элемента из каталога. */
function TplAddItemSquareButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="size-7 shrink-0"
      disabled={disabled}
      aria-label="Добавить элемент"
      onClick={onClick}
    >
      <Plus className="size-4" strokeWidth={2} />
    </Button>
  );
}

/** Откуда открыли модалку «Элемент из библиотеки» — поля группы/типа зависят от контекста. */
type ItemDialogAddContext =
  | "default"
  | "global_recommendations"
  | "stage_system_recommendations"
  | "stage_system_tests"
  | "custom_group";

export type TreatmentProgramLibraryRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  thumbUrl?: string | null;
  /** Описание шаблона комплекса ЛФК из каталога (для модалки развёртывания в упражнения). */
  description?: string | null;
};

export type TreatmentProgramLibraryPickers = {
  exercises: TreatmentProgramLibraryRow[];
  lfkComplexes: TreatmentProgramLibraryRow[];
  testSets: TreatmentProgramLibraryRow[];
  recommendations: TreatmentProgramLibraryRow[];
  lessons: TreatmentProgramLibraryRow[];
};

type Props = {
  templateId: string;
  initialDetail: TreatmentProgramTemplateDetail;
  library: TreatmentProgramLibraryPickers;
  /** Снимок с сервера (`[id]/page`). Если не передан — подгружается через GET `/usage`. */
  externalUsageSnapshot?: TreatmentProgramTemplateUsageSnapshot;
  /** После успешной архивации (например обновить список в master-detail). */
  onArchived?: () => void;
};

function TemplateUsageSectionsView({ sections }: { sections: TreatmentProgramTemplateUsageSection[] }) {
  if (sections.length === 0) {
    return <p className="mt-1 text-sm text-muted-foreground">Пока не используется в программах пациентов и курсах.</p>;
  }
  return (
    <div className="mt-2 space-y-3">
      {sections.map((sec) => (
        <div key={sec.key}>
          <p className="text-sm text-muted-foreground">{sec.summary}</p>
          {sec.refs.length > 0 ? (
            <ul className="mt-1 ml-3 list-disc space-y-0.5 text-sm">
              {sec.refs.map((r: TreatmentProgramTemplateUsageRef) => (
                <li key={`${sec.key}-${r.kind}-${r.id}`}>
                  <Link
                    href={doctorTreatmentProgramTemplateUsageHref(r)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {sec.total > sec.refs.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Показаны первые {sec.refs.length} из {sec.total}.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LibraryMediaThumb({
  src,
  itemType,
  compact,
}: {
  src: string | null | undefined;
  itemType: TreatmentProgramItemType;
  /** Компактная строка списка этапа (~36px). */
  compact?: boolean;
}) {
  const box = compact ? "size-9" : "size-12";
  const iconSz = compact ? "size-4" : "size-5";
  const icon =
    itemType === "lesson" ? (
      <BookOpen className={`${iconSz} text-muted-foreground`} aria-hidden />
    ) : itemType === "test_set" ? (
      <ClipboardList className={`${iconSz} text-muted-foreground`} aria-hidden />
    ) : (
      <ImageIcon className={`${iconSz} text-muted-foreground`} aria-hidden />
    );
  if (src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- doctor library previews (/api/media or absolute)
      <img
        src={src.trim()}
        alt=""
        className={`${box} shrink-0 rounded-md border border-border/60 object-cover`}
      />
    );
  }
  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40`}
      aria-hidden
    >
      {icon}
    </div>
  );
}

function findLibraryRow(
  lib: TreatmentProgramLibraryPickers,
  type: TreatmentProgramItemType,
  id: string,
): TreatmentProgramLibraryRow | null {
  const rows = (() => {
    switch (type) {
      case "exercise":
        return lib.exercises;
      case "lfk_complex":
        return lib.lfkComplexes;
      case "test_set":
        return lib.testSets;
      case "recommendation":
        return lib.recommendations;
      case "lesson":
        return lib.lessons;
      default:
        return [];
    }
  })();
  return rows.find((r) => r.id === id) ?? null;
}

function StageItemListRow({
  library,
  item,
  editLocked,
  onOpenSettings,
}: {
  library: TreatmentProgramLibraryPickers;
  item: TreatmentProgramStageItem;
  editLocked: boolean;
  onOpenSettings: () => void;
}) {
  const libRow = findLibraryRow(library, item.itemType, item.itemRefId);
  return (
    <li className="flex min-w-0 items-center gap-2 px-2 py-2">
      <LibraryMediaThumb compact src={libRow?.thumbUrl} itemType={item.itemType} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{libRow?.title ?? item.itemRefId}</p>
        <p className="text-xs text-muted-foreground">{ITEM_TYPE_LABEL[item.itemType]}</p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="shrink-0"
        disabled={editLocked}
        aria-label="Настройки элемента"
        onClick={onOpenSettings}
      >
        <Settings className="size-4" />
      </Button>
    </li>
  );
}

/** Стабильный порядок для этапов и элементов (как на сервере в `getTemplateById`). */
function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

type StageWithChildren = TreatmentProgramTemplateDetail["stages"][number];

function orderedGroupsForStage(stage: StageWithChildren) {
  return sortDoctorTemplateStageGroupsForDisplay(stage.groups);
}

function ungroupedItemsForStage(stage: StageWithChildren) {
  return sortByOrderThenId(stage.items.filter((i) => !i.groupId));
}

function itemsInGroupForStage(stage: StageWithChildren, groupId: string) {
  return sortByOrderThenId(stage.items.filter((i) => i.groupId === groupId));
}

function templateGroupHeaderSurfaceStyle(g: TreatmentProgramTemplateStageGroup): CSSProperties {
  if (g.systemKind === "recommendations") {
    return { background: TPL_HEADER_BG_RECOMMENDATIONS };
  }
  if (g.systemKind === "tests") {
    return { background: TPL_HEADER_BG_GROUP_TESTS };
  }
  return { background: TPL_HEADER_BG_GROUP_CUSTOM };
}

function findItemAndStage(
  d: TreatmentProgramTemplateDetail,
  itemId: string,
): { stage: StageWithChildren; item: TreatmentProgramStageItem } | null {
  for (const stage of d.stages) {
    const item = stage.items.find((i) => i.id === itemId);
    if (item) return { stage, item };
  }
  return null;
}

/** B7: комментарий элемента шаблона (template `comment` → копия в instance при назначении). */
function TemplateStageItemCommentBlock({
  itemId,
  initialComment,
  disabled,
  onReload,
}: {
  itemId: string;
  initialComment: string | null;
  disabled: boolean;
  onReload: () => Promise<void>;
}) {
  const [value, setValue] = useState(initialComment ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialComment ?? "");
  }, [itemId, initialComment]);

  return (
    <div className="mt-2 w-full min-w-0 border-t border-border/30 pt-2">
      <Label className="text-xs text-muted-foreground" htmlFor={`tpl-item-c-${itemId}`}>
        Комментарий для пациента (шаблон)
      </Label>
      <Textarea
        id={`tpl-item-c-${itemId}`}
        rows={2}
        className="mt-1 text-sm"
        disabled={disabled || saving}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || saving}
          onClick={async () => {
            setSaving(true);
            setMsg(null);
            try {
              const res = await fetch(`/api/doctor/treatment-program-templates/stage-items/${itemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment: value.trim() === "" ? null : value.trim() }),
              });
              const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
              if (!res.ok || !json.ok) {
                setMsg(json.error ?? "Не удалось сохранить");
                return;
              }
              await onReload();
              setMsg("Сохранено");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Сохранение…" : "Сохранить комментарий"}
        </Button>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>
    </div>
  );
}

export function TreatmentProgramConstructorClient({
  templateId,
  initialDetail,
  library,
  externalUsageSnapshot,
  onArchived,
}: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState<TreatmentProgramTemplateDetail>(initialDetail);
  const [itemDialogStageId, setItemDialogStageId] = useState<string | null>(null);
  const [groupDialogStageId, setGroupDialogStageId] = useState<string | null>(null);
  const [stageSettingsStageId, setStageSettingsStageId] = useState<string | null>(null);
  const [itemSettingsItemId, setItemSettingsItemId] = useState<string | null>(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState("");
  const [newStageGoals, setNewStageGoals] = useState("");
  const [newStageObjectives, setNewStageObjectives] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemType, setItemType] = useState<TreatmentProgramItemType>("exercise");
  const [itemSearch, setItemSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<TreatmentProgramTemplateUsageSnapshot | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [archiveWarnOpen, setArchiveWarnOpen] = useState(false);
  const [archiveWarnUsage, setArchiveWarnUsage] = useState<TreatmentProgramTemplateUsageSnapshot | null>(null);
  const [goalsDraft, setGoalsDraft] = useState("");
  const [objectivesDraft, setObjectivesDraft] = useState("");
  const [durationDaysDraft, setDurationDaysDraft] = useState("");
  const [durationTextDraft, setDurationTextDraft] = useState("");
  const [stageTitleDraft, setStageTitleDraft] = useState("");
  const [stageDescriptionDraft, setStageDescriptionDraft] = useState("");
  const [stageMetaMsg, setStageMetaMsg] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(initialDetail.title);
  const [descriptionDraft, setDescriptionDraft] = useState(initialDetail.description ?? "");
  const [templateBasicsBusy, setTemplateBasicsBusy] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupSchedule, setNewGroupSchedule] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [groupEditOpen, setGroupEditOpen] = useState(false);
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupEditTitle, setGroupEditTitle] = useState("");
  const [groupEditSchedule, setGroupEditSchedule] = useState("");
  const [groupEditDescription, setGroupEditDescription] = useState("");
  const [itemAddGroupId, setItemAddGroupId] = useState<string>("");
  /** Требуется явная пользовательская группа (не рек./тесты, не ЛФК «без группы») — показать подсветку селекта. */
  const [itemAddGroupShowInvalid, setItemAddGroupShowInvalid] = useState(false);
  const [itemDialogAddContext, setItemDialogAddContext] = useState<ItemDialogAddContext>("default");

  useEffect(() => {
    setDetail(initialDetail);
    setTitleDraft(initialDetail.title);
    setDescriptionDraft(initialDetail.description ?? "");
  }, [initialDetail]);

  useEffect(() => {
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      setUsageLoadError(null);
      setUsageBusy(false);
      return;
    }
    let cancelled = false;
    setUsageBusy(true);
    setUsageLoadError(null);
    void fetch(`/api/doctor/treatment-program-templates/${templateId}/usage`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; usage?: TreatmentProgramTemplateUsageSnapshot };
        if (!cancelled) {
          if (res.ok && json.ok && json.usage) setUsage(json.usage);
          else {
            setUsage(null);
            setUsageLoadError("Не удалось загрузить сводку использования");
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsage(null);
          setUsageLoadError("Не удалось загрузить сводку использования");
        }
      })
      .finally(() => {
        if (!cancelled) setUsageBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId, externalUsageSnapshot]);

  const usageSections = useMemo(() => {
    if (!usage || !treatmentProgramTemplateUsageHasAnyReference(usage)) return [];
    return treatmentProgramTemplateUsageSections(usage);
  }, [usage]);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/doctor/treatment-program-templates/${templateId}`);
    const json = (await res.json()) as { ok?: boolean; item?: TreatmentProgramTemplateDetail; error?: string };
    if (json.ok && json.item) {
      setDetail(json.item);
      setTitleDraft(json.item.title);
      setDescriptionDraft(json.item.description ?? "");
    }
  }, [templateId]);

  const isArchived = detail.status === "archived";

  const refetchUsageClient = useCallback(async () => {
    if (externalUsageSnapshot !== undefined) return;
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/${templateId}/usage`);
      const json = (await res.json()) as { ok?: boolean; usage?: TreatmentProgramTemplateUsageSnapshot };
      if (res.ok && json.ok && json.usage) setUsage(json.usage);
    } catch {
      /* ignore */
    }
  }, [templateId, externalUsageSnapshot]);

  const flushTemplateBasicsIfChanged = useCallback(async () => {
    if (isArchived || templateBasicsBusy) return;
    const t = titleDraft.trim();
    if (!t) {
      setError("Укажите название шаблона");
      setTitleDraft(detail.title);
      return;
    }
    const descTrimmed = descriptionDraft.trim();
    const d = descTrimmed === "" ? null : descTrimmed;
    if (t === detail.title && d === (detail.description ?? null)) return;
    setTemplateBasicsBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, description: d }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        item?: TreatmentProgramTemplateDetail;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось сохранить название и описание");
        return;
      }
      await reload();
      await refetchUsageClient();
      router.refresh();
    } finally {
      setTemplateBasicsBusy(false);
    }
  }, [
    descriptionDraft,
    detail.description,
    detail.title,
    isArchived,
    refetchUsageClient,
    reload,
    router,
    templateBasicsBusy,
    templateId,
    titleDraft,
  ]);

  async function tryArchiveTemplate(withAck: boolean): Promise<boolean> {
    const url = withAck
      ? `/api/doctor/treatment-program-templates/${templateId}?acknowledgeUsageWarning=1`
      : `/api/doctor/treatment-program-templates/${templateId}`;
    const res = await fetch(url, { method: "DELETE" });
    const json = (await res.json()) as {
      ok?: boolean;
      code?: string;
      usage?: TreatmentProgramTemplateUsageSnapshot;
      error?: string;
    };
    if (res.ok && json.ok) return true;
    if (res.status === 409 && json.code === USAGE_CONFIRMATION_REQUIRED && json.usage) {
      setArchiveWarnUsage(json.usage);
      setArchiveWarnOpen(true);
      return false;
    }
    setError(json.error ?? "Не удалось отправить шаблон в архив");
    return false;
  }

  async function handleArchiveClick() {
    if (isArchived) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await tryArchiveTemplate(false);
      if (!ok) return;
      setArchiveWarnOpen(false);
      setArchiveWarnUsage(null);
      await reload();
      await refetchUsageClient();
      onArchived?.();
      if (!onArchived) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveConfirmAck() {
    setBusy(true);
    setError(null);
    try {
      const ok = await tryArchiveTemplate(true);
      if (!ok) return;
      setArchiveWarnOpen(false);
      setArchiveWarnUsage(null);
      await reload();
      await refetchUsageClient();
      onArchived?.();
      if (!onArchived) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const patchPublicationStatus = useCallback(
    async (status: "draft" | "published") => {
      if (detail.status === "archived") return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/doctor/treatment-program-templates/${templateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Не удалось обновить статус шаблона");
          return;
        }
        await reload();
        await refetchUsageClient();
        router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [detail.status, templateId, reload, refetchUsageClient, router],
  );

  const orderedStages = useMemo(() => sortByOrderThenId(detail.stages), [detail.stages]);
  /** Строка этапа в БД с `sort_order === 0`: хранение общих рекомендаций шаблона, не «этап лечения». */
  const globalRecommendationsStorage = useMemo(
    () => orderedStages.find((s) => s.sortOrder === 0) ?? null,
    [orderedStages],
  );
  const stagesNonZero = useMemo(() => orderedStages.filter((s) => s.sortOrder !== 0), [orderedStages]);

  useEffect(() => {
    if (itemDialogAddContext === "custom_group") return;
    setItemAddGroupId("");
  }, [itemDialogStageId, itemType, itemDialogAddContext]);

  useEffect(() => {
    if (stageSettingsStageId && !detail.stages.some((s) => s.id === stageSettingsStageId)) {
      setStageSettingsStageId(null);
    }
    if (itemDialogStageId && !detail.stages.some((s) => s.id === itemDialogStageId)) {
      setItemDialogOpen(false);
      setItemDialogStageId(null);
      setItemDialogAddContext("default");
    }
    if (groupDialogStageId && !detail.stages.some((s) => s.id === groupDialogStageId)) {
      setGroupDialogOpen(false);
      setGroupDialogStageId(null);
    }
    if (itemSettingsItemId && !findItemAndStage(detail, itemSettingsItemId)) {
      setItemSettingsItemId(null);
    }
  }, [detail, stageSettingsStageId, itemDialogStageId, groupDialogStageId, itemSettingsItemId]);

  useEffect(() => {
    if (!stageSettingsStageId) {
      setStageMetaMsg(null);
      return;
    }
    const st = detail.stages.find((s) => s.id === stageSettingsStageId);
    if (!st) return;
    setStageTitleDraft(st.title);
    setStageDescriptionDraft(st.description ?? "");
    setGoalsDraft(st.goals ?? "");
    setObjectivesDraft(st.objectives ?? "");
    setDurationDaysDraft(st.expectedDurationDays != null ? String(st.expectedDurationDays) : "");
    setDurationTextDraft(st.expectedDurationText ?? "");
    setStageMetaMsg(null);
  }, [stageSettingsStageId, detail.stages]);

  const itemPickerGroupsOrdered = useMemo(() => {
    if (!itemDialogStageId) return [];
    const st = detail.stages.find((s) => s.id === itemDialogStageId);
    if (!st) return [];
    return sortDoctorTemplateStageGroupsForDisplay(st.groups).filter((g) => !g.systemKind);
  }, [detail.stages, itemDialogStageId]);

  const openItemDialogFromGlobalRecommendations = useCallback((stageId: string) => {
    setItemDialogAddContext("global_recommendations");
    setItemDialogStageId(stageId);
    setItemType("recommendation");
    setItemAddGroupId("");
    setItemSearch("");
    setItemAddGroupShowInvalid(false);
    setItemDialogOpen(true);
  }, []);

  const openItemDialogFromGroup = useCallback((stageId: string, g: TreatmentProgramTemplateStageGroup) => {
    setItemDialogStageId(stageId);
    setItemSearch("");
    setItemAddGroupShowInvalid(false);
    if (g.systemKind === "recommendations") {
      setItemDialogAddContext("stage_system_recommendations");
      setItemType("recommendation");
      setItemAddGroupId("");
    } else if (g.systemKind === "tests") {
      setItemDialogAddContext("stage_system_tests");
      setItemType("test_set");
      setItemAddGroupId("");
    } else {
      setItemDialogAddContext("custom_group");
      setItemType("exercise");
      setItemAddGroupId(g.id);
    }
    setItemDialogOpen(true);
  }, []);

  const allowUngroupedItemAdd = itemType === "recommendation" || itemType === "test_set";
  const itemAddNeedsPickableGroup = !allowUngroupedItemAdd && itemType !== "lfk_complex";

  useEffect(() => {
    if (!itemDialogOpen) setItemAddGroupShowInvalid(false);
  }, [itemDialogOpen]);

  useEffect(() => {
    if (!itemDialogOpen || !itemAddNeedsPickableGroup) return;
    const picked = itemAddGroupId && itemAddGroupId !== "__none__" ? itemAddGroupId.trim() : "";
    if (picked && itemPickerGroupsOrdered.some((g) => g.id === picked)) {
      setItemAddGroupShowInvalid(false);
    }
  }, [itemDialogOpen, itemAddNeedsPickableGroup, itemAddGroupId, itemPickerGroupsOrdered]);

  useEffect(() => {
    if (!itemDialogOpen || !itemDialogStageId) return;
    /** Для комплекса ЛФК целевую группу выбирает врач вручную (в т.ч. «Без группы»). */
    if (itemDialogAddContext === "custom_group") return;
    if (!allowUngroupedItemAdd && itemType !== "lfk_complex" && itemPickerGroupsOrdered.length > 0) {
      setItemAddGroupId((prev) => {
        const cur = prev && prev !== "__none__" ? prev.trim() : "";
        if (cur && itemPickerGroupsOrdered.some((g) => g.id === cur)) return prev;
        return itemPickerGroupsOrdered[0]!.id;
      });
    }
  }, [
    itemDialogOpen,
    itemDialogStageId,
    itemType,
    allowUngroupedItemAdd,
    itemPickerGroupsOrdered,
    itemDialogAddContext,
  ]);

  const pickerList = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const filter = <T extends { title: string }>(rows: T[]) =>
      q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;

    switch (itemType) {
      case "exercise":
        return filter(library.exercises);
      case "lfk_complex":
        return filter(library.lfkComplexes);
      case "test_set":
        return filter(library.testSets);
      case "recommendation":
        return filter(library.recommendations);
      case "lesson":
        return filter(library.lessons);
      default:
        return [];
    }
  }, [itemSearch, itemType, library]);

  async function patchStageSortOrder(stageId: string, sortOrder: number): Promise<boolean> {
    const res = await fetch(`/api/doctor/treatment-program-templates/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    return res.ok && !!json.ok;
  }

  async function patchItemSortOrder(itemId: string, sortOrder: number): Promise<boolean> {
    const res = await fetch(`/api/doctor/treatment-program-templates/stage-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    return res.ok && !!json.ok;
  }

  async function handleSaveStageSettings() {
    const sid = stageSettingsStageId;
    if (!sid || editLocked) return;
    const stMeta = detail.stages.find((s) => s.id === sid);
    if (stMeta?.sortOrder === 0) return;
    const titleTrim = stageTitleDraft.trim();
    if (!titleTrim) {
      setStageMetaMsg("Укажите название этапа");
      return;
    }
    const daysTrim = durationDaysDraft.trim();
    let expectedDurationDays: number | null = null;
    if (daysTrim !== "") {
      const n = Number.parseInt(daysTrim, 10);
      if (!Number.isFinite(n) || n < 0 || String(n) !== daysTrim) {
        setStageMetaMsg("Ожидаемый срок в днях: неотрицательное целое число");
        return;
      }
      expectedDurationDays = n;
    }
    setBusy(true);
    setStageMetaMsg(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleTrim,
          description: stageDescriptionDraft.trim() === "" ? null : stageDescriptionDraft.trim(),
          goals: goalsDraft.trim() || null,
          objectives: objectivesDraft.trim() || null,
          expectedDurationDays,
          expectedDurationText: durationTextDraft.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStageMetaMsg(json.error ?? "Не удалось сохранить");
        return;
      }
      await reload();
      setStageMetaMsg("Сохранено");
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveStage(stageId: string, dir: -1 | 1) {
    const sorted = sortByOrderThenId(detail.stages);
    const idx = sorted.findIndex((s) => s.id === stageId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[idx]!;
    const b = sorted[j]!;
    if (a.sortOrder === 0 || b.sortOrder === 0) return;
    setBusy(true);
    setError(null);
    try {
      const ok1 = await patchStageSortOrder(a.id, b.sortOrder);
      const ok2 = await patchStageSortOrder(b.id, a.sortOrder);
      if (!ok1 || !ok2) {
        setError("Не удалось изменить порядок этапов");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStage(stageId: string): Promise<boolean> {
    if (!globalThis.confirm("Удалить этап и все элементы в нём?")) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${stageId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError("Не удалось удалить этап");
        return false;
      }
      if (stageSettingsStageId === stageId) setStageSettingsStageId(null);
      if (itemDialogStageId === stageId) {
        setItemDialogOpen(false);
        setItemDialogStageId(null);
        setItemDialogAddContext("default");
      }
      if (groupDialogStageId === stageId) {
        setGroupDialogOpen(false);
        setGroupDialogStageId(null);
      }
      if (itemSettingsItemId) {
        const loc = findItemAndStage(detail, itemSettingsItemId);
        if (loc?.stage.id === stageId) setItemSettingsItemId(null);
      }
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveItemInSubgroup(sectionItems: TreatmentProgramStageItem[], itemId: string, dir: -1 | 1) {
    const sorted = sortByOrderThenId(sectionItems);
    const idx = sorted.findIndex((it) => it.id === itemId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[idx]!;
    const b = sorted[j]!;
    setBusy(true);
    setError(null);
    try {
      const ok1 = await patchItemSortOrder(a.id, b.sortOrder);
      const ok2 = await patchItemSortOrder(b.id, a.sortOrder);
      if (!ok1 || !ok2) {
        setError("Не удалось изменить порядок элементов");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function patchItemGroupId(itemId: string, groupId: string | null) {
    const res = await fetch(`/api/doctor/treatment-program-templates/stage-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    return res.ok && !!json.ok;
  }

  async function handleAddGroup() {
    if (!groupDialogStageId) return;
    const title = newGroupTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${groupDialogStageId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: newGroupDescription.trim() || null,
          scheduleText: newGroupSchedule.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить группу");
        return;
      }
      setNewGroupTitle("");
      setNewGroupSchedule("");
      setNewGroupDescription("");
      setGroupDialogOpen(false);
      setGroupDialogStageId(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleReorderGroup(stage: StageWithChildren, groupId: string, dir: -1 | 1) {
    const sorted = sortDoctorTemplateStageGroupsForDisplay(stage.groups).filter((g) => !g.systemKind);
    const idx = sorted.findIndex((g) => g.id === groupId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[idx]!;
    const b = sorted[j]!;
    const newOrder = sorted.map((g) => g.id);
    newOrder[idx] = b.id;
    newOrder[j] = a.id;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-templates/stages/${stage.id}/groups/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedGroupIds: newOrder }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось изменить порядок групп");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    const found = detail.stages.flatMap((st) => st.groups).find((g) => g.id === groupId);
    if (found && isTreatmentProgramTemplateSystemStageGroup(found)) {
      setError("Системную группу нельзя удалить");
      return;
    }
    if (!globalThis.confirm("Удалить группу? Элементы останутся вне группы.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stage-groups/${groupId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError("Не удалось удалить группу");
        return;
      }
      await reload();
      if (groupEditId === groupId) {
        setGroupEditOpen(false);
        setGroupEditId(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function openEditGroup(g: TreatmentProgramTemplateStageGroup) {
    if (isTreatmentProgramTemplateSystemStageGroup(g)) return;
    setGroupEditId(g.id);
    setGroupEditTitle(g.title);
    setGroupEditSchedule(g.scheduleText ?? "");
    setGroupEditDescription(g.description ?? "");
    setGroupEditOpen(true);
  }

  async function handleSaveGroupEdit() {
    if (!groupEditId) return;
    const found = detail.stages.flatMap((st) => st.groups).find((g) => g.id === groupEditId);
    if (found && isTreatmentProgramTemplateSystemStageGroup(found)) return;
    const title = groupEditTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stage-groups/${groupEditId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: groupEditDescription.trim() || null,
          scheduleText: groupEditSchedule.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось сохранить группу");
        return;
      }
      setGroupEditOpen(false);
      setGroupEditId(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStage() {
    const title = newStageTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/${templateId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          goals: newStageGoals.trim() || null,
          objectives: newStageObjectives.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить этап");
        return;
      }
      setNewStageTitle("");
      setNewStageGoals("");
      setNewStageObjectives("");
      setStageDialogOpen(false);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleAddItem(refId: string) {
    if (!itemDialogStageId) return;
    const st = detail.stages.find((s) => s.id === itemDialogStageId);
    if (!st) return;

    let gid: string | null = null;
    if (itemType === "recommendation") {
      if (st.sortOrder === 0) {
        gid = null;
      } else {
        const rg = st.groups.find((g) => g.systemKind === "recommendations");
        if (!rg) {
          setError("Не найдена системная группа «Рекомендации» для этапа");
          return;
        }
        gid = rg.id;
      }
    } else if (itemType === "test_set") {
      if (st.sortOrder === 0) {
        setError("Наборы тестов нельзя добавлять на этап «Общие рекомендации»");
        return;
      }
      const tg = st.groups.find((g) => g.systemKind === "tests");
      if (!tg) {
        setError("Не найдена системная группа «Тестирование» для этапа");
        return;
      }
      gid = tg.id;
    } else {
      const picked = itemAddGroupId && itemAddGroupId !== "__none__" ? itemAddGroupId.trim() : "";
      if (!picked || !itemPickerGroupsOrdered.some((g) => g.id === picked)) {
        setItemAddGroupShowInvalid(true);
        setError(null);
        queueMicrotask(() => {
          document.getElementById("lib-search")?.focus();
        });
        return;
      }
      gid = picked;
    }

    setBusy(true);
    setError(null);
    setItemAddGroupShowInvalid(false);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${itemDialogStageId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType,
          itemRefId: refId,
          groupId: gid,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить элемент");
        return;
      }
      setItemDialogOpen(false);
      setItemDialogStageId(null);
      setItemDialogAddContext("default");
      setItemSearch("");
      setItemAddGroupId("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  /** Разворачивает комплекс ЛФК сразу по выбору группы в модалке «Элемент из библиотеки». */
  async function handleAddLfkComplexFromLibrary(row: TreatmentProgramLibraryRow) {
    if (!itemDialogStageId || isArchived || busy) return;
    const st = detail.stages.find((s) => s.id === itemDialogStageId);
    if (!st) return;
    if (st.sortOrder === 0) {
      setError("На этапе «Общие рекомендации» нельзя разворачивать комплекс ЛФК");
      return;
    }

    const rawGid = itemAddGroupId && itemAddGroupId !== "__none__" ? itemAddGroupId.trim() : "";
    let body: Record<string, unknown>;
    if (!rawGid) {
      body = {
        templateId,
        complexTemplateId: row.id,
        copyComplexDescriptionToGroup: false,
        mode: "ungrouped",
      };
    } else if (itemPickerGroupsOrdered.some((g) => g.id === rawGid)) {
      body = {
        templateId,
        complexTemplateId: row.id,
        copyComplexDescriptionToGroup: false,
        mode: "existing_group",
        existingGroupId: rawGid,
      };
    } else {
      setError("Выберите группу из списка");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-templates/stages/${itemDialogStageId}/items/from-lfk-complex`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string; code?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить упражнения из комплекса");
        return;
      }
      setItemDialogOpen(false);
      setItemDialogStageId(null);
      setItemDialogAddContext("default");
      setItemSearch("");
      setItemAddGroupId("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!globalThis.confirm("Удалить элемент из этапа?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stage-items/${itemId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError("Не удалось удалить");
        return;
      }
      if (itemSettingsItemId === itemId) setItemSettingsItemId(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const archiveWarnSections = useMemo(() => {
    if (!archiveWarnUsage || !treatmentProgramTemplateUsageHasAnyReference(archiveWarnUsage)) return [];
    return treatmentProgramTemplateUsageSections(archiveWarnUsage);
  }, [archiveWarnUsage]);

  const editLocked = busy || isArchived;

  const itemSettingsContext = useMemo(() => {
    if (!itemSettingsItemId) return null;
    return findItemAndStage(detail, itemSettingsItemId);
  }, [detail, itemSettingsItemId]);

  const itemSettingsGroupSelectItems = useMemo(() => {
    if (!itemSettingsContext) return {};
    const m: Record<string, ReactNode> = {};
    if (
      itemSettingsContext.item.itemType === "recommendation" ||
      itemSettingsContext.item.itemType === "test_set"
    ) {
      m[treatmentProgramGroupSelectNoneItemValue] = treatmentProgramGroupSelectNoneLabel;
    }
    for (const g of sortDoctorTemplateStageGroupsForDisplay(itemSettingsContext.stage.groups).filter(
      (x) => !x.systemKind,
    )) {
      m[g.id] = g.title;
    }
    return m;
  }, [itemSettingsContext]);

  const itemSettingsGroupDisplayLabel = useMemo(() => {
    if (!itemSettingsContext) return null;
    const v = itemSettingsContext.item.groupId ?? treatmentProgramGroupSelectNoneItemValue;
    const fromMap = itemSettingsGroupSelectItems[v];
    if (fromMap != null) return fromMap;
    const g = itemSettingsContext.stage.groups.find((x) => x.id === itemSettingsContext.item.groupId);
    return g?.title ?? treatmentProgramGroupSelectNoneLabel;
  }, [itemSettingsContext, itemSettingsGroupSelectItems]);

  const itemSettingsReorderState = useMemo(() => {
    if (!itemSettingsContext) return null;
    const it = itemSettingsContext.item;
    const st = itemSettingsContext.stage;
    const section = it.groupId ? itemsInGroupForStage(st, it.groupId) : ungroupedItemsForStage(st);
    const itemIndex = section.findIndex((i) => i.id === it.id);
    return { section, itemIndex, itemId: it.id };
  }, [itemSettingsContext]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Label htmlFor="tpl-prog-title">Название</Label>
          <TreatmentProgramTemplateStatusBadge status={detail.status} className="shrink-0" />
        </div>
        <Input
          id="tpl-prog-title"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => void flushTemplateBasicsIfChanged()}
          disabled={isArchived || templateBasicsBusy}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tpl-prog-desc">Описание</Label>
        <Textarea
          id="tpl-prog-desc"
          className="min-h-[80px]"
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          onBlur={() => void flushTemplateBasicsIfChanged()}
          disabled={isArchived || templateBasicsBusy}
        />
      </div>

      {globalRecommendationsStorage ? (
        /* Общие рекомендации: отдельная карточка, не секция «этап» (в БД — строка этапа для хранения элементов). */
        <section
          key={globalRecommendationsStorage.id}
          className={TPL_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS}
        >
          <div
            className="flex items-center justify-between gap-2 border-b border-border/40 px-2 py-1.5"
            style={{ background: TPL_HEADER_BG_RECOMMENDATIONS }}
          >
            <h2 className="min-w-0 text-sm font-semibold leading-tight text-foreground">Общие рекомендации</h2>
            <TplAddItemSquareButton
              disabled={editLocked}
              onClick={() => openItemDialogFromGlobalRecommendations(globalRecommendationsStorage.id)}
            />
          </div>
          <div className="p-3">
            {ungroupedItemsForStage(globalRecommendationsStorage).length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет рекомендаций.</p>
            ) : (
              <ul className="divide-y rounded-md border border-border/50">
                {ungroupedItemsForStage(globalRecommendationsStorage).map((it) => (
                  <StageItemListRow
                    key={it.id}
                    library={library}
                    item={it}
                    editLocked={editLocked}
                    onOpenSettings={() => setItemSettingsItemId(it.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {isArchived ? (
        <p className="text-sm text-muted-foreground">Шаблон в архиве — изменение этапов и элементов отключено.</p>
      ) : null}

      <div className="flex min-h-0 w-full min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Этапы</h2>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={tplToolbarTextBtnClass}
            disabled={editLocked}
            onClick={() => setStageDialogOpen(true)}
          >
            + Этап
          </Button>
        </div>
        {orderedStages.length === 0 ? (
          <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">Нет этапов — добавьте первый.</p>
        ) : stagesNonZero.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
            Добавьте этап лечения — блок рекомендаций вынесен выше.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {stagesNonZero.map((s) => {
              const fullIdx = orderedStages.findIndex((x) => x.id === s.id);
              const prevStage = fullIdx > 0 ? orderedStages[fullIdx - 1]! : null;
              const groupsOrd = orderedGroupsForStage(s);
              const ungrouped = ungroupedItemsForStage(s);
              return (
                <section key={s.id} className={TPL_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS}>
                  <div
                    className="border-b border-border/40 px-2 py-1.5"
                    style={{ background: TPL_HEADER_BG_STAGE_EDITABLE }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 pt-0.5">
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          Этап {s.sortOrder}
                        </span>
                        <h3 className="mt-0.5 text-sm font-semibold leading-tight text-foreground">{s.title}</h3>
                        {s.description?.trim() ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
                            {s.description.trim()}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-start gap-1 self-start">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className={tplToolbarTextBtnClass}
                          disabled={editLocked}
                          onClick={() => {
                            setGroupDialogStageId(s.id);
                            setNewGroupTitle("");
                            setNewGroupSchedule("");
                            setNewGroupDescription("");
                            setGroupDialogOpen(true);
                          }}
                        >
                          + Группа
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 shrink-0"
                          disabled={editLocked}
                          aria-label="Настройки этапа"
                          onClick={() => setStageSettingsStageId(s.id)}
                        >
                          <Settings className="size-3.5" />
                        </Button>
                        <TemplateReorderChevrons
                          compact
                          className="-mt-px shrink-0"
                          disabled={editLocked}
                          disableUp={!prevStage || prevStage.sortOrder === 0}
                          disableDown={fullIdx >= orderedStages.length - 1}
                          ariaLabelUp="Этап выше"
                          ariaLabelDown="Этап ниже"
                          onUp={() => void handleMoveStage(s.id, -1)}
                          onDown={() => void handleMoveStage(s.id, 1)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    {groupsOrd.length === 0 && s.items.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">В этапе пока нет элементов и групп.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {groupsOrd.map((g, groupIndex) => {
                          const gItems = itemsInGroupForStage(s, g.id);
                          const sys = isTreatmentProgramTemplateSystemStageGroup(g);
                          return (
                            <div
                              key={g.id}
                              className="overflow-hidden rounded-md border border-border/50 bg-background/60"
                            >
                              {sys ? (
                                <div
                                  className="flex items-start justify-between gap-2 border-b border-border/25 px-2 py-1.5"
                                  style={templateGroupHeaderSurfaceStyle(g)}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-tight text-foreground">{g.title}</p>
                                    {g.scheduleText?.trim() ? (
                                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                                        {g.scheduleText.trim()}
                                      </p>
                                    ) : null}
                                  </div>
                                  <TplAddItemSquareButton
                                    disabled={editLocked}
                                    onClick={() => openItemDialogFromGroup(s.id, g)}
                                  />
                                </div>
                              ) : (
                                <div
                                  className="flex items-start justify-between gap-2 border-b border-border/25 px-2 py-1.5"
                                  style={templateGroupHeaderSurfaceStyle(g)}
                                >
                                  <div className="min-w-0 flex-1 pt-0.5">
                                    <p className="text-sm font-semibold leading-snug text-foreground">{g.title}</p>
                                    {g.scheduleText?.trim() ? (
                                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                                        {g.scheduleText.trim()}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-start gap-1 self-start">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className={tplToolbarTextBtnClass}
                                      disabled={editLocked}
                                      onClick={() => openEditGroup(g)}
                                    >
                                      Изменить
                                    </Button>
                                    <TplAddItemSquareButton
                                      disabled={editLocked}
                                      onClick={() => openItemDialogFromGroup(s.id, g)}
                                    />
                                    <TemplateReorderChevrons
                                      compact
                                      className="-mt-px shrink-0"
                                      disabled={editLocked}
                                      disableUp={groupIndex === 0}
                                      disableDown={groupIndex >= groupsOrd.length - 1}
                                      ariaLabelUp="Группа выше"
                                      ariaLabelDown="Группа ниже"
                                      onUp={() => void handleReorderGroup(s, g.id, -1)}
                                      onDown={() => void handleReorderGroup(s, g.id, 1)}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="p-2">
                                {gItems.length === 0 ? (
                                  <p className="py-2 text-xs text-muted-foreground">В группе пока нет элементов.</p>
                                ) : (
                                  <ul className="divide-y rounded-md border border-border/30">
                                    {gItems.map((it) => (
                                      <StageItemListRow
                                        key={it.id}
                                        library={library}
                                        item={it}
                                        editLocked={editLocked}
                                        onOpenSettings={() => setItemSettingsItemId(it.id)}
                                      />
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {ungrouped.length > 0 ? (
                          <div className="overflow-hidden rounded-md border-2 border-destructive bg-background/60">
                            <div className="border-b border-destructive/50 bg-destructive/20 px-2 py-2 dark:bg-destructive/30">
                              <p className="text-sm font-semibold text-foreground">Без группы</p>
                            </div>
                            <div className="p-2">
                              <ul className="divide-y rounded-md border border-border/50">
                                {ungrouped.map((it) => (
                                  <StageItemListRow
                                    key={it.id}
                                    library={library}
                                    item={it}
                                    editLocked={editLocked}
                                    onOpenSettings={() => setItemSettingsItemId(it.id)}
                                  />
                                ))}
                              </ul>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <DoctorCatalogPersistPublishBar
        mode="callbacks"
        isArchived={isArchived}
        pending={busy}
        isPublished={detail.status === "published"}
        catalogRecordExists
        persistLabel="Сохранить черновик"
        persistDisabled={busy || isArchived || detail.status === "draft"}
        publishDisabled={busy || isArchived || detail.status === "published"}
        onPersist={() => void patchPublicationStatus("draft")}
        onPublish={() => void patchPublicationStatus("published")}
      />

      <div className="border-t border-border/60 pt-4">
        <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
          <h2 className="text-sm font-medium text-foreground">Где используется</h2>
          {usageBusy ? (
            <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
          ) : usageLoadError ? (
            <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
          ) : (
            <TemplateUsageSectionsView sections={usageSections} />
          )}
        </div>

        {!isArchived ? (
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleArchiveClick()}>
            Архивировать
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {detail.status === "published"
          ? "«Сохранить черновик» переводит шаблон обратно в черновик. Название и описание сохраняются при уходе с поля."
          : detail.status === "draft"
            ? "Опубликуйте шаблон, когда этапы и элементы готовы. Название и описание сохраняются при уходе с поля."
            : "Архивный шаблон нельзя редактировать."}
      </p>

      <Dialog
        open={stageSettingsStageId != null}
        onOpenChange={(open) => {
          if (!open) setStageSettingsStageId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Настройки этапа</DialogTitle>
            <DialogDescription>Название, описание, цели и сроки этапа шаблона.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-stage-modal-title">Название этапа</Label>
              <Input
                id="tpl-stage-modal-title"
                className="text-sm"
                value={stageTitleDraft}
                onChange={(e) => setStageTitleDraft(e.target.value)}
                disabled={editLocked || busy}
                maxLength={2000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-stage-modal-desc">Описание этапа</Label>
              <Textarea
                id="tpl-stage-modal-desc"
                rows={2}
                className="text-sm"
                value={stageDescriptionDraft}
                onChange={(e) => setStageDescriptionDraft(e.target.value)}
                disabled={editLocked || busy}
                maxLength={20000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-stage-modal-goals">Цель этапа</Label>
              <Textarea
                id="tpl-stage-modal-goals"
                rows={3}
                disabled={editLocked || busy}
                value={goalsDraft}
                onChange={(e) => setGoalsDraft(e.target.value)}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">Кратко, в свободной форме (markdown).</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-stage-modal-obj">Задачи этапа</Label>
              <Textarea
                id="tpl-stage-modal-obj"
                rows={3}
                disabled={editLocked || busy}
                value={objectivesDraft}
                onChange={(e) => setObjectivesDraft(e.target.value)}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Список задач текстом (markdown); структурированный чеклист в БД не хранится (O1).
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-stage-modal-days">Ожидаемый срок, дней</Label>
              <Input
                id="tpl-stage-modal-days"
                inputMode="numeric"
                disabled={editLocked || busy}
                value={durationDaysDraft}
                onChange={(e) => setDurationDaysDraft(e.target.value)}
                className="w-full max-w-[12rem] text-sm"
                placeholder="например 14"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-stage-modal-durtxt">Ожидаемый срок, текстом</Label>
              <Input
                id="tpl-stage-modal-durtxt"
                disabled={editLocked || busy}
                value={durationTextDraft}
                onChange={(e) => setDurationTextDraft(e.target.value)}
                className="w-full text-sm"
                placeholder="2–3 недели"
              />
            </div>
            {stageMetaMsg ? <p className="text-sm text-muted-foreground">{stageMetaMsg}</p> : null}
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button type="button" disabled={editLocked || busy} onClick={() => void handleSaveStageSettings()}>
                Сохранить
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={editLocked || busy || !stageSettingsStageId}
                onClick={() => {
                  const id = stageSettingsStageId;
                  if (!id) return;
                  void handleDeleteStage(id);
                }}
              >
                Удалить этап
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(itemSettingsItemId)}
        onOpenChange={(open) => {
          if (!open) setItemSettingsItemId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {itemSettingsContext ? (
            <>
              <DialogHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:space-y-0">
                <div className="min-w-0 flex-1 space-y-2">
                  <DialogTitle>Настройки элемента</DialogTitle>
                  <DialogDescription>
                    {ITEM_TYPE_LABEL[itemSettingsContext.item.itemType]} —{" "}
                    {findLibraryRow(library, itemSettingsContext.item.itemType, itemSettingsContext.item.itemRefId)
                      ?.title ?? itemSettingsContext.item.itemRefId}
                  </DialogDescription>
                </div>
                {itemSettingsReorderState ? (
                  <TemplateReorderChevrons
                    compact
                    disabled={editLocked || busy}
                    disableUp={itemSettingsReorderState.itemIndex <= 0}
                    disableDown={
                      itemSettingsReorderState.itemIndex < 0 ||
                      itemSettingsReorderState.itemIndex >= itemSettingsReorderState.section.length - 1
                    }
                    ariaLabelUp="Элемент выше в списке"
                    ariaLabelDown="Элемент ниже в списке"
                    onUp={() =>
                      void handleMoveItemInSubgroup(
                        itemSettingsReorderState.section,
                        itemSettingsReorderState.itemId,
                        -1,
                      )
                    }
                    onDown={() =>
                      void handleMoveItemInSubgroup(
                        itemSettingsReorderState.section,
                        itemSettingsReorderState.itemId,
                        1,
                      )
                    }
                    className="shrink-0 sm:mt-0.5"
                  />
                ) : null}
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Группа</Label>
                  <Select
                    value={itemSettingsContext.item.groupId ?? "__none__"}
                    onValueChange={(v) => {
                      void (async () => {
                        const next = v === "__none__" ? null : v;
                        if (
                          next === null &&
                          itemSettingsContext.item.itemType !== "recommendation" &&
                          itemSettingsContext.item.itemType !== "test_set"
                        ) {
                          setError("Без группы допустимы только рекомендации и наборы тестов");
                          return;
                        }
                        setBusy(true);
                        setError(null);
                        try {
                          const ok = await patchItemGroupId(itemSettingsContext.item.id, next);
                          if (!ok) setError("Не удалось изменить группу");
                          else await reload();
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                    disabled={editLocked}
                    items={itemSettingsGroupSelectItems}
                  >
                    <SelectTrigger
                      className="w-full text-sm"
                      displayLabel={itemSettingsGroupDisplayLabel ?? undefined}
                    />
                    <SelectContent className="z-[100]">
                      {itemSettingsContext.item.itemType === "recommendation" ||
                      itemSettingsContext.item.itemType === "test_set" ? (
                        <SelectItem value="__none__">Без группы</SelectItem>
                      ) : null}
                      {sortDoctorTemplateStageGroupsForDisplay(itemSettingsContext.stage.groups)
                        .filter((g) => !g.systemKind)
                        .map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <TemplateStageItemCommentBlock
                  itemId={itemSettingsContext.item.id}
                  initialComment={itemSettingsContext.item.comment}
                  disabled={editLocked}
                  onReload={reload}
                />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={editLocked || busy}
                  onClick={() => void handleRemoveItem(itemSettingsContext.item.id)}
                >
                  Удалить элемент
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый этап</DialogTitle>
            <DialogDescription>Порядок назначит сервер автоматически (следующий номер после существующих).</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="stage-title">Название</Label>
            <Input
              id="stage-title"
              className="text-sm"
              value={newStageTitle}
              onChange={(e) => setNewStageTitle(e.target.value)}
              maxLength={2000}
            />
            <Label htmlFor="stage-new-goals">Цель этапа (опционально)</Label>
            <Textarea
              id="stage-new-goals"
              rows={2}
              className="text-sm"
              value={newStageGoals}
              onChange={(e) => setNewStageGoals(e.target.value)}
              placeholder="Кратко, markdown"
            />
            <Label htmlFor="stage-new-obj">Задачи этапа (опционально)</Label>
            <Textarea
              id="stage-new-obj"
              rows={2}
              className="text-sm"
              value={newStageObjectives}
              onChange={(e) => setNewStageObjectives(e.target.value)}
              placeholder="Список задач текстом, markdown"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStageDialogOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={editLocked || !newStageTitle.trim()} onClick={handleAddStage}>
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={itemDialogOpen}
        onOpenChange={(open) => {
          setItemDialogOpen(open);
          if (!open) {
            setItemDialogStageId(null);
            setItemDialogAddContext("default");
            setItemAddGroupId("");
            setItemSearch("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Элемент из библиотеки</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {itemDialogAddContext === "custom_group" ? (
              <div className="flex flex-col gap-2">
                <Label>Тип элемента</Label>
                <div
                  className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-input p-px"
                  role="radiogroup"
                  aria-label="Тип элемента"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={itemType === "exercise"}
                    className={cn(
                      "text-xs font-medium transition-colors",
                      itemType === "exercise"
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-foreground hover:bg-muted/60",
                    )}
                    onClick={() => {
                      setItemType("exercise");
                      setItemSearch("");
                      setItemAddGroupShowInvalid(false);
                    }}
                  >
                    Упражнение ЛФК
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={itemType === "lfk_complex"}
                    className={cn(
                      "text-xs font-medium transition-colors",
                      itemType === "lfk_complex"
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-foreground hover:bg-muted/60",
                    )}
                    onClick={() => {
                      setItemType("lfk_complex");
                      setItemSearch("");
                      setItemAddGroupShowInvalid(false);
                    }}
                  >
                    Комплекс ЛФК
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="lib-search">Поиск</Label>
              <Input
                id="lib-search"
                className="text-sm"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Фильтр по названию"
              />
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
              {pickerList.length === 0 ? (
                <li className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  Нет записей для выбранного типа.
                </li>
              ) : (
                pickerList.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={editLocked}
                      onClick={() =>
                        itemType === "lfk_complex"
                          ? void handleAddLfkComplexFromLibrary(row)
                          : void handleAddItem(row.id)
                      }
                      className="flex w-full items-start gap-3 rounded-md border border-border/50 bg-card/20 px-2 py-2 text-left text-sm shadow-sm transition-colors hover:border-border hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <LibraryMediaThumb src={row.thumbUrl} itemType={itemType} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium leading-snug">{row.title}</span>
                        {row.subtitle?.trim() ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                            {row.subtitle.trim()}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={groupDialogOpen}
        onOpenChange={(open) => {
          setGroupDialogOpen(open);
          if (!open) setGroupDialogStageId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-group-title">Название</Label>
            <Input
              id="new-group-title"
              className="text-sm"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              maxLength={2000}
            />
            <Label htmlFor="new-group-schedule">Расписание / подзаголовок (необязательно)</Label>
            <Input
              id="new-group-schedule"
              className="text-sm"
              value={newGroupSchedule}
              onChange={(e) => setNewGroupSchedule(e.target.value)}
              maxLength={5000}
            />
            <Label htmlFor="new-group-desc">Описание (необязательно)</Label>
            <Textarea
              id="new-group-desc"
              rows={2}
              className="text-sm"
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              maxLength={10000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={editLocked || !newGroupTitle.trim() || !groupDialogStageId}
              onClick={() => void handleAddGroup()}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupEditOpen} onOpenChange={setGroupEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Группа</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-group-title">Название</Label>
            <Input
              id="edit-group-title"
              className="text-sm"
              value={groupEditTitle}
              onChange={(e) => setGroupEditTitle(e.target.value)}
              maxLength={2000}
            />
            <Label htmlFor="edit-group-schedule">Расписание / подзаголовок</Label>
            <Input
              id="edit-group-schedule"
              className="text-sm"
              value={groupEditSchedule}
              onChange={(e) => setGroupEditSchedule(e.target.value)}
              maxLength={5000}
            />
            <Label htmlFor="edit-group-desc">Описание</Label>
            <Textarea
              id="edit-group-desc"
              rows={2}
              className="text-sm"
              value={groupEditDescription}
              onChange={(e) => setGroupEditDescription(e.target.value)}
              maxLength={10000}
            />
          </div>
          <DialogFooter className="sm:flex-row sm:justify-between sm:gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={editLocked || busy || !groupEditId}
              onClick={() => {
                if (groupEditId) void handleDeleteGroup(groupEditId);
              }}
            >
              Удалить группу
            </Button>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setGroupEditOpen(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                disabled={editLocked || !groupEditTitle.trim()}
                onClick={() => void handleSaveGroupEdit()}
              >
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveWarnOpen}
        onOpenChange={(o) => {
          setArchiveWarnOpen(o);
          if (!o) setArchiveWarnUsage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить шаблон в архив?</DialogTitle>
            <DialogDescription>
              Есть активные программы у пациентов или опубликованные курсы, ссылающиеся на этот шаблон. В архиве
              шаблон нельзя назначать заново; уже запущенные программы и история сохраняются.
            </DialogDescription>
          </DialogHeader>
          <TemplateUsageSectionsView sections={archiveWarnSections} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setArchiveWarnOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void handleArchiveConfirmAck()}
            >
              В архив, с подтверждением
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
