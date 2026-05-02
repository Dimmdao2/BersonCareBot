"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateUsageRef,
  TreatmentProgramTemplateUsageSnapshot,
} from "@/modules/treatment-program/types";
import { doctorTreatmentProgramTemplateUsageHref } from "../templateUsageDocLinks";
import {
  treatmentProgramTemplateUsageHasAnyReference,
  treatmentProgramTemplateUsageSections,
  type TreatmentProgramTemplateUsageSection,
} from "../templateUsageSummaryText";

const ITEM_TYPE_LABEL: Record<TreatmentProgramItemType, string> = {
  exercise: "Упражнение ЛФК",
  lfk_complex: "Комплекс ЛФК",
  recommendation: "Рекомендация",
  lesson: "Урок (страница контента)",
  test_set: "Набор тестов",
};

export type TreatmentProgramLibraryPickers = {
  exercises: Array<{ id: string; title: string }>;
  lfkComplexes: Array<{ id: string; title: string }>;
  testSets: Array<{ id: string; title: string }>;
  recommendations: Array<{ id: string; title: string }>;
  lessons: Array<{ id: string; title: string }>;
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

/** Стабильный порядок для этапов и элементов (как на сервере в `getTemplateById`). */
function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
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

  const isArchived = detail.status === "archived";

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

  const orderedStages = useMemo(() => sortByOrderThenId(detail.stages), [detail.stages]);

  const selectedStage = useMemo(
    () => detail.stages.find((s) => s.id === selectedStageId) ?? null,
    [detail.stages, selectedStageId],
  );

  const orderedStageItems = useMemo(
    () => (selectedStage ? sortByOrderThenId(selectedStage.items) : []),
    [selectedStage],
  );

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

  async function handleMoveStage(stageId: string, dir: -1 | 1) {
    const sorted = sortByOrderThenId(detail.stages);
    const idx = sorted.findIndex((s) => s.id === stageId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[idx]!;
    const b = sorted[j]!;
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

  async function handleMoveItem(itemId: string, dir: -1 | 1) {
    if (!selectedStage) return;
    const sorted = sortByOrderThenId(selectedStage.items);
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

  async function handleAddStage() {
    const title = newStageTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/treatment-program-templates/${templateId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить этап");
        return;
      }
      setNewStageTitle("");
      setStageDialogOpen(false);
      const full = await fetch(`/api/doctor/treatment-program-templates/${templateId}`);
      const body = (await full.json()) as { ok?: boolean; item?: TreatmentProgramTemplateDetail };
      if (body.ok && body.item) {
        setDetail(body.item);
        const last = body.item.stages[body.item.stages.length - 1];
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
        body: JSON.stringify({ itemType, itemRefId: refId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось добавить элемент");
        return;
      }
      setItemDialogOpen(false);
      setItemSearch("");
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

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-md border border-border/60 bg-card/20 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
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
          {!isArchived ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void handleArchiveClick()}
            >
              В архив
            </Button>
          ) : (
            <span className="shrink-0 text-xs uppercase text-muted-foreground">В архиве</span>
          )}
        </div>
      </section>

      {isArchived ? (
        <p className="text-sm text-muted-foreground">Шаблон в архиве — изменение этапов и элементов отключено.</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(220px,300px)_1fr]">
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
                        ? "min-w-0 flex-1 px-3 py-2 text-left text-sm font-medium bg-muted"
                        : "min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-muted/50"
                    }
                  >
                    <span className="line-clamp-2">{s.title}</span>
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
            <Button
              type="button"
              size="sm"
              disabled={!selectedStage || editLocked}
              onClick={() => {
                setItemDialogOpen(true);
                setItemType("exercise");
                setItemSearch("");
              }}
            >
              Добавить из библиотеки
            </Button>
          </div>

          {!selectedStage ? (
            <p className="text-sm text-muted-foreground">Выберите этап слева.</p>
          ) : orderedStageItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">В этапе пока нет элементов.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {orderedStageItems.map((it, itemIndex) => (
                <li key={it.id} className="flex flex-wrap items-center gap-2 px-2 py-2 text-sm">
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={editLocked || itemIndex === 0}
                      aria-label="Элемент выше"
                      onClick={() => void handleMoveItem(it.id, -1)}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={editLocked || itemIndex >= orderedStageItems.length - 1}
                      aria-label="Элемент ниже"
                      onClick={() => void handleMoveItem(it.id, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{ITEM_TYPE_LABEL[it.itemType]}</span>
                    <span className="ml-2 text-muted-foreground">
                      {libraryEntryTitle(library, it.itemType, it.itemRefId) ?? it.itemRefId}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={editLocked}
                  >
                    Удалить
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый этап</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="stage-title">Название</Label>
            <Input
              id="stage-title"
              value={newStageTitle}
              onChange={(e) => setNewStageTitle(e.target.value)}
              maxLength={2000}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
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
                  <SelectValue />
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
              <Label htmlFor="lib-search">Поиск</Label>
              <Input
                id="lib-search"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Фильтр по названию"
              />
            </div>
            <ul className="max-h-56 overflow-auto rounded-md border">
              {pickerList.length === 0 ? (
                <li className="px-3 py-4 text-sm text-muted-foreground">Нет записей для выбранного типа.</li>
              ) : (
                pickerList.map((row) => (
                  <li key={row.id} className="border-b last:border-0">
                    <button
                      type="button"
                      disabled={editLocked}
                      onClick={() => handleAddItem(row.id)}
                    >
                      {row.title}
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

function libraryEntryTitle(
  lib: TreatmentProgramLibraryPickers,
  type: TreatmentProgramItemType,
  id: string,
): string | null {
  let list: Array<{ id: string; title: string }>;
  switch (type) {
    case "exercise":
      list = lib.exercises;
      break;
    case "lfk_complex":
      list = lib.lfkComplexes;
      break;
    case "test_set":
      list = lib.testSets;
      break;
    case "recommendation":
      list = lib.recommendations;
      break;
    case "lesson":
      list = lib.lessons;
      break;
    default:
      return null;
  }
  return list.find((r) => r.id === id)?.title ?? null;
}
