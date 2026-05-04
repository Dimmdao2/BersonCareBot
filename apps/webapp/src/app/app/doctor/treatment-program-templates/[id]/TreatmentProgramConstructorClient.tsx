"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ClipboardList, ImageIcon, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { USAGE_CONFIRMATION_REQUIRED } from "@/modules/treatment-program/errors";
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
  treatmentProgramTemplateUsageHasAnyReference,
  treatmentProgramTemplateUsageSections,
  type TreatmentProgramTemplateUsageSection,
} from "../templateUsageSummaryText";
import { TreatmentProgramTemplateStatusBadge } from "../TreatmentProgramTemplateStatusBadge";

const ITEM_TYPE_LABEL: Record<TreatmentProgramItemType, string> = {
  exercise: "Упражнение ЛФК",
  lfk_complex: "Комплекс ЛФК",
  recommendation: "Рекомендация",
  lesson: "Урок (страница контента)",
  test_set: "Набор тестов",
};

export type TreatmentProgramLibraryRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  thumbUrl?: string | null;
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
}: {
  src: string | null | undefined;
  itemType: TreatmentProgramItemType;
}) {
  const icon =
    itemType === "lesson" ? (
      <BookOpen className="size-5 text-muted-foreground" aria-hidden />
    ) : itemType === "test_set" ? (
      <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
    ) : (
      <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
    );
  if (src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- doctor library previews (/api/media or absolute)
      <img
        src={src.trim()}
        alt=""
        className="size-12 shrink-0 rounded-md border border-border/60 object-cover"
      />
    );
  }
  return (
    <div
      className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40"
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

/** Стабильный порядок для этапов и элементов (как на сервере в `getTemplateById`). */
function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
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
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    initialDetail.stages[0]?.id ?? null,
  );
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState("");
  const [newStageGoals, setNewStageGoals] = useState("");
  const [newStageObjectives, setNewStageObjectives] = useState("");
  const [newStageSortOrder, setNewStageSortOrder] = useState("");
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
  const [stageMetaMsg, setStageMetaMsg] = useState<string | null>(null);
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

  useEffect(() => {
    setDetail(initialDetail);
    setSelectedStageId((prev) =>
      prev && initialDetail.stages.some((s) => s.id === prev)
        ? prev
        : (initialDetail.stages[0]?.id ?? null),
    );
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
      setSelectedStageId((prev) =>
        prev && json.item!.stages.some((s) => s.id === prev) ? prev : json.item!.stages[0]?.id ?? null,
      );
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

  const selectedStage = useMemo(
    () => detail.stages.find((s) => s.id === selectedStageId) ?? null,
    [detail.stages, selectedStageId],
  );

  useEffect(() => {
    if (!selectedStage) {
      setGoalsDraft("");
      setObjectivesDraft("");
      setDurationDaysDraft("");
      setDurationTextDraft("");
      setStageMetaMsg(null);
      return;
    }
    setGoalsDraft(selectedStage.goals ?? "");
    setObjectivesDraft(selectedStage.objectives ?? "");
    setDurationDaysDraft(
      selectedStage.expectedDurationDays != null ? String(selectedStage.expectedDurationDays) : "",
    );
    setDurationTextDraft(selectedStage.expectedDurationText ?? "");
    setStageMetaMsg(null);
  }, [selectedStage]);

  const orderedStageGroups = useMemo(
    () => (selectedStage ? sortByOrderThenId(selectedStage.groups) : []),
    [selectedStage],
  );

  const ungroupedItems = useMemo(
    () => (selectedStage ? sortByOrderThenId(selectedStage.items.filter((i) => !i.groupId)) : []),
    [selectedStage],
  );

  function itemsInGroup(groupId: string): TreatmentProgramStageItem[] {
    if (!selectedStage) return [];
    return sortByOrderThenId(selectedStage.items.filter((i) => i.groupId === groupId));
  }

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

  async function handleSaveStageMetadata() {
    if (!selectedStageId || editLocked) return;
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
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${selectedStageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    if (a.sortOrder === 0 || b.sortOrder === 0) {
      const ok = globalThis.confirm(
        "Один из этапов имеет порядок 0 — у пациента он показывается как «Общие рекомендации». После перестановки другой этап может получить эту роль. Продолжить?",
      );
      if (!ok) return;
    }
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

  async function handleDeleteStage(stageId: string) {
    if (!globalThis.confirm("Удалить этап и все элементы в нём?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${stageId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError("Не удалось удалить этап");
        return;
      }
      if (selectedStageId === stageId) setSelectedStageId(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveItemInSubgroup(sectionItems: TreatmentProgramStageItem[], itemId: string, dir: -1 | 1) {
    if (!selectedStage) return;
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
    if (!selectedStageId) return;
    const title = newGroupTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${selectedStageId}/groups`, {
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
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleReorderGroup(groupId: string, dir: -1 | 1) {
    if (!selectedStage) return;
    const sorted = sortByOrderThenId(selectedStage.groups);
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
        `/api/doctor/treatment-program-templates/stages/${selectedStage.id}/groups/reorder`,
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
    } finally {
      setBusy(false);
    }
  }

  function openEditGroup(g: TreatmentProgramTemplateStageGroup) {
    setGroupEditId(g.id);
    setGroupEditTitle(g.title);
    setGroupEditSchedule(g.scheduleText ?? "");
    setGroupEditDescription(g.description ?? "");
    setGroupEditOpen(true);
  }

  async function handleSaveGroupEdit() {
    if (!groupEditId) return;
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
      const sortTrim = newStageSortOrder.trim();
      let sortOrder: number | undefined;
      if (sortTrim !== "") {
        const n = Number.parseInt(sortTrim, 10);
        if (!Number.isFinite(n) || String(n) !== sortTrim || n < 0) {
          setError("Порядок этапа: неотрицательное целое число или пусто для авто");
          return;
        }
        sortOrder = n;
      }
      const postBody: Record<string, unknown> = {
        title,
        goals: newStageGoals.trim() || null,
        objectives: newStageObjectives.trim() || null,
      };
      if (sortOrder !== undefined) postBody.sortOrder = sortOrder;
      const res = await fetch(`/api/doctor/treatment-program-templates/${templateId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить этап");
        return;
      }
      setNewStageTitle("");
      setNewStageGoals("");
      setNewStageObjectives("");
      setNewStageSortOrder("");
      setStageDialogOpen(false);
      const full = await fetch(`/api/doctor/treatment-program-templates/${templateId}`);
      const reloadJson = (await full.json()) as { ok?: boolean; item?: TreatmentProgramTemplateDetail };
      if (reloadJson.ok && reloadJson.item) {
        setDetail(reloadJson.item);
        const last = reloadJson.item.stages[reloadJson.item.stages.length - 1];
        if (last) setSelectedStageId(last.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddItem(refId: string) {
    if (!selectedStageId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/stages/${selectedStageId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType,
          itemRefId: refId,
          groupId: itemAddGroupId && itemAddGroupId !== "__none__" ? itemAddGroupId : null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить элемент");
        return;
      }
      setItemDialogOpen(false);
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

  const renderStageItemRow = (it: TreatmentProgramStageItem, section: TreatmentProgramStageItem[], itemIndex: number) => {
    const libRow = findLibraryRow(library, it.itemType, it.itemRefId);
    return (
      <li key={it.id} className="text-sm">
        <div className="flex flex-wrap items-center gap-2 px-2 py-2">
          <div className="flex shrink-0 flex-col gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              disabled={editLocked || itemIndex === 0}
              aria-label="Элемент выше"
              onClick={() => void handleMoveItemInSubgroup(section, it.id, -1)}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              disabled={editLocked || itemIndex >= section.length - 1}
              aria-label="Элемент ниже"
              onClick={() => void handleMoveItemInSubgroup(section, it.id, 1)}
            >
              <ChevronDown className="size-4" />
            </Button>
          </div>
          <LibraryMediaThumb src={libRow?.thumbUrl} itemType={it.itemType} />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{ITEM_TYPE_LABEL[it.itemType]}</span>
            <span className="ml-2 text-muted-foreground">
              {libRow?.title ?? it.itemRefId}
            </span>
            {libRow?.subtitle?.trim() ? (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{libRow.subtitle.trim()}</p>
            ) : null}
          </div>
          <Select
            value={it.groupId ?? "__none__"}
            onValueChange={(v) => {
              void (async () => {
                const next = v === "__none__" ? null : v;
                setBusy(true);
                setError(null);
                try {
                  const ok = await patchItemGroupId(it.id, next);
                  if (!ok) setError("Не удалось изменить группу");
                  else await reload();
                } finally {
                  setBusy(false);
                }
              })();
            }}
            disabled={editLocked}
          >
            <SelectTrigger className="h-8 w-[min(100%,11rem)] text-xs">
              <SelectValue placeholder="Группа" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Без группы</SelectItem>
              {orderedStageGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={editLocked}
            onClick={() => void handleRemoveItem(it.id)}
          >
            Удалить
          </Button>
        </div>
        <div className="px-2 pb-2">
          <TemplateStageItemCommentBlock
            itemId={it.id}
            initialComment={it.comment}
            disabled={editLocked}
            onReload={reload}
          />
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <header className="sticky top-0 z-20 -mx-1 flex flex-col gap-3 border-b border-border/60 bg-background/95 px-1 pb-3 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="text-lg font-semibold leading-tight tracking-tight text-foreground line-clamp-2">
              {detail.title}
            </h1>
            <TreatmentProgramTemplateStatusBadge status={detail.status} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DoctorCatalogPersistPublishBar
              mode="callbacks"
              className="border-t-0 pt-0"
              buttonSize="sm"
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
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy || isArchived}
              onClick={() => void handleArchiveClick()}
            >
              Архивировать
            </Button>
          </div>
        </div>
      </header>

      <section className="rounded-md border border-border/60 bg-card/20 p-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Где используется</h2>
          {usageBusy ? (
            <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
          ) : usageLoadError ? (
            <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
          ) : (
            <TemplateUsageSectionsView sections={usageSections} />
          )}
        </div>
      </section>

      {isArchived ? (
        <p className="text-sm text-muted-foreground">Шаблон в архиве — изменение этапов и элементов отключено.</p>
      ) : null}

      <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(240px,320px)_1fr] md:items-start">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Этапы</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={editLocked}
              onClick={() => setStageDialogOpen(true)}
            >
              + Этап
            </Button>
          </div>
          <ul className="divide-y rounded-md border">
            {orderedStages.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">Нет этапов — добавьте первый.</li>
            ) : (
              orderedStages.map((s, stageIndex) => (
                <li key={s.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedStageId(s.id)}
                    className={
                      selectedStageId === s.id
                        ? "min-w-0 flex-1 text-left text-sm font-medium bg-muted"
                        : "min-w-0 flex-1 text-left text-sm hover:bg-muted/50"
                    }
                  >
                    <span className="flex flex-col items-start gap-1 px-3 py-2">
                      <span className="line-clamp-2">{s.title}</span>
                      {s.sortOrder === 0 ? (
                        <Badge
                          variant="secondary"
                          className="max-w-full whitespace-normal text-left text-[10px] font-normal leading-tight"
                        >
                          Этап 0 — «Общие рекомендации» у пациента
                        </Badge>
                      ) : null}
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col justify-center gap-0.5 py-1 pr-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={editLocked || stageIndex === 0}
                      aria-label="Этап выше"
                      onClick={(e) => {
                        e.preventDefault();
                        void handleMoveStage(s.id, -1);
                      }}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={editLocked || stageIndex >= orderedStages.length - 1}
                      aria-label="Этап ниже"
                      onClick={(e) => {
                        e.preventDefault();
                        void handleMoveStage(s.id, 1);
                      }}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={editLocked}
                      onClick={(e) => {
                        e.preventDefault();
                        void handleDeleteStage(s.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Элементы этапа
              {selectedStage ? (
                <span className="ml-2 font-normal text-muted-foreground">— {selectedStage.title}</span>
              ) : null}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!selectedStage || editLocked}
                onClick={() => {
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
                size="sm"
                disabled={!selectedStage || editLocked}
                onClick={() => {
                  setItemDialogOpen(true);
                  setItemType("exercise");
                  setItemSearch("");
                  setItemAddGroupId("");
                }}
              >
                Добавить из библиотеки
              </Button>
            </div>
          </div>

          {selectedStage?.sortOrder === 0 ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-foreground">
              <span className="font-medium">Этап с порядком 0.</span> У пациента он отображается в блоке «Общие
              рекомендации» (вне прогресса этапов, всегда доступен для чтения). Сюда логично класть постоянные
              рекомендации и общий режим.
            </p>
          ) : null}

          {selectedStage ? (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`tpl-stage-goals-${selectedStage.id}`}>Цель этапа</Label>
                  <Textarea
                    id={`tpl-stage-goals-${selectedStage.id}`}
                    rows={3}
                    disabled={editLocked || busy}
                    value={goalsDraft}
                    onChange={(e) => setGoalsDraft(e.target.value)}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Кратко, в свободной форме (markdown).</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`tpl-stage-obj-${selectedStage.id}`}>Задачи этапа</Label>
                  <Textarea
                    id={`tpl-stage-obj-${selectedStage.id}`}
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
                  <Label htmlFor={`tpl-stage-days-${selectedStage.id}`}>Ожидаемый срок, дней</Label>
                  <Input
                    id={`tpl-stage-days-${selectedStage.id}`}
                    inputMode="numeric"
                    disabled={editLocked || busy}
                    value={durationDaysDraft}
                    onChange={(e) => setDurationDaysDraft(e.target.value)}
                    className="max-w-[12rem] text-sm"
                    placeholder="например 14"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`tpl-stage-durtxt-${selectedStage.id}`}>Ожидаемый срок, текстом</Label>
                  <Input
                    id={`tpl-stage-durtxt-${selectedStage.id}`}
                    disabled={editLocked || busy}
                    value={durationTextDraft}
                    onChange={(e) => setDurationTextDraft(e.target.value)}
                    className="text-sm"
                    placeholder="2–3 недели"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={editLocked || busy}
                    onClick={() => void handleSaveStageMetadata()}
                  >
                    Сохранить цели этапа
                  </Button>
                  {stageMetaMsg ? (
                    <span className="text-xs text-muted-foreground">{stageMetaMsg}</span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!selectedStage ? (
            <p className="text-sm text-muted-foreground">Выберите этап слева.</p>
          ) : orderedStageGroups.length === 0 && selectedStage.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">В этапе пока нет элементов и групп.</p>
          ) : (
            <div className="space-y-4">
              {orderedStageGroups.map((g, groupIndex) => {
                const gItems = itemsInGroup(g.id);
                return (
                  <div key={g.id} className="rounded-md border border-border/60 bg-card/30 p-2">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-2">
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={editLocked || groupIndex === 0}
                          aria-label="Группа выше"
                          onClick={() => void handleReorderGroup(g.id, -1)}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={editLocked || groupIndex >= orderedStageGroups.length - 1}
                          aria-label="Группа ниже"
                          onClick={() => void handleReorderGroup(g.id, 1)}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{g.title}</p>
                        {g.scheduleText?.trim() ? (
                          <p className="text-xs text-muted-foreground">{g.scheduleText.trim()}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={editLocked}
                        onClick={() => openEditGroup(g)}
                      >
                        Изменить
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={editLocked}
                        onClick={() => void handleDeleteGroup(g.id)}
                      >
                        Удалить
                      </Button>
                    </div>
                    {gItems.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">В группе пока нет элементов.</p>
                    ) : (
                      <ul className="divide-y rounded-md border border-border/40">
                        {gItems.map((it, itemIndex) => renderStageItemRow(it, gItems, itemIndex))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {orderedStageGroups.length > 0 && (
                <p className="text-sm font-medium text-muted-foreground">Без группы</p>
              )}
              {ungroupedItems.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {ungroupedItems.map((it, itemIndex) =>
                    renderStageItemRow(it, ungroupedItems, itemIndex),
                  )}
                </ul>
              ) : orderedStageGroups.length > 0 ? (
                <p className="text-xs text-muted-foreground">Нет элементов вне групп.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый этап</DialogTitle>
            <DialogDescription>
              Порядок не указан — сервер назначит следующий номер. Первый этап в шаблоне получает порядок 0 и у
              пациента показывается как «Общие рекомендации».
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="stage-title">Название</Label>
            <Input
              id="stage-title"
              value={newStageTitle}
              onChange={(e) => setNewStageTitle(e.target.value)}
              maxLength={2000}
            />
            <Label htmlFor="stage-sort">Порядок (sort_order), опционально</Label>
            <Input
              id="stage-sort"
              inputMode="numeric"
              value={newStageSortOrder}
              onChange={(e) => setNewStageSortOrder(e.target.value)}
              placeholder="Пусто — автоматически"
            />
            <p className="text-xs text-muted-foreground">
              Целое ≥ 0. Обычно 0 — только один этап «Общие рекомендации»; остальные — 1, 2, …
            </p>
            <Label htmlFor="stage-new-goals">Цель этапа (опционально)</Label>
            <Textarea
              id="stage-new-goals"
              rows={2}
              value={newStageGoals}
              onChange={(e) => setNewStageGoals(e.target.value)}
              placeholder="Кратко, markdown"
            />
            <Label htmlFor="stage-new-obj">Задачи этапа (опционально)</Label>
            <Textarea
              id="stage-new-obj"
              rows={2}
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

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Элемент из библиотеки</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label>Тип</Label>
              <Select
                value={itemType}
                onValueChange={(v) => {
                  setItemType(v as TreatmentProgramItemType);
                  setItemSearch("");
                }}
              >
                <SelectTrigger>
                  <SelectValue>{ITEM_TYPE_LABEL[itemType]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ITEM_TYPE_LABEL) as TreatmentProgramItemType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ITEM_TYPE_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Группа для нового элемента</Label>
              <Select
                value={itemAddGroupId && itemAddGroupId !== "" ? itemAddGroupId : "__none__"}
                onValueChange={(v) => setItemAddGroupId(v === "__none__" ? "" : (v ?? ""))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без группы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без группы</SelectItem>
                  {(selectedStage ? sortByOrderThenId(selectedStage.groups) : []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lib-search">Поиск</Label>
              <Input
                id="lib-search"
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
                      onClick={() => void handleAddItem(row.id)}
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

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-group-title">Название</Label>
            <Input
              id="new-group-title"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              maxLength={2000}
            />
            <Label htmlFor="new-group-schedule">Расписание / подзаголовок (необязательно)</Label>
            <Input
              id="new-group-schedule"
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
            <Button type="button" disabled={editLocked || !newGroupTitle.trim()} onClick={() => void handleAddGroup()}>
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
              value={groupEditTitle}
              onChange={(e) => setGroupEditTitle(e.target.value)}
              maxLength={2000}
            />
            <Label htmlFor="edit-group-schedule">Расписание / подзаголовок</Label>
            <Input
              id="edit-group-schedule"
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGroupEditOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={editLocked || !groupEditTitle.trim()} onClick={() => void handleSaveGroupEdit()}>
              Сохранить
            </Button>
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
