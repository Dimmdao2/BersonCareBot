"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import toast from "react-hot-toast";
import type { Template } from "@/modules/lfk-templates/types";
import type { ExerciseMedia } from "@/modules/lfk-exercises/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LfkTemplateUsageSnapshot } from "@/modules/lfk-templates/types";
import {
  archiveDoctorLfkTemplate,
  fetchDoctorLfkTemplateUsageSnapshot,
  persistLfkTemplateDraft,
  publishLfkTemplateAction,
  type ArchiveDoctorLfkTemplateState,
} from "./actions";
import { doctorLfkTemplateUsageHref } from "./lfkTemplatesUsageDocLinks";
import {
  lfkTemplateUsageHasAnyReference,
  lfkTemplateUsageSections,
  type LfkTemplateUsageSection,
} from "./lfkTemplatesUsageSummaryText";
import { editorLinesToTemplateExerciseInputs } from "./templateExercisePayload";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import { ExerciseListCatalogThumb } from "@/shared/ui/media/ExerciseListCatalogThumb";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";

type ExerciseOption = { id: string; title: string; firstMedia: ExerciseMedia | null };

type EditorLine = {
  sortId: string;
  exerciseId: string;
  title: string;
  reps: string;
  sets: string;
  side: string;
  maxPain: string;
  comment: string;
};

function templateToLines(t: Template): EditorLine[] {
  return t.exercises.map((e) => ({
    sortId: e.id,
    exerciseId: e.exerciseId,
    title: e.exerciseTitle ?? e.exerciseId,
    reps: e.reps != null ? String(e.reps) : "",
    sets: e.sets != null ? String(e.sets) : "",
    side: e.side ?? "",
    maxPain: e.maxPain0_10 != null ? String(e.maxPain0_10) : "",
    comment: e.comment ?? "",
  }));
}

function parseSide(raw: string): "left" | "right" | "both" | null {
  if (raw === "left" || raw === "right" || raw === "both") return raw;
  return null;
}

function optInt(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function linesToPayload(lines: EditorLine[]) {
  return editorLinesToTemplateExerciseInputs(
    lines.map((l) => ({
      exerciseId: l.exerciseId,
      reps: optInt(l.reps),
      sets: optInt(l.sets),
      side: parseSide(l.side),
      maxPain0_10: optInt(l.maxPain),
      comment: l.comment.trim() || null,
    }))
  );
}

function LfkTemplateUsageSectionsView({ sections }: { sections: LfkTemplateUsageSection[] }) {
  if (sections.length === 0) {
    return <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>;
  }
  return (
    <div className="mt-2 space-y-3">
      {sections.map((sec) => (
        <div key={sec.key}>
          <p className="text-sm text-muted-foreground">{sec.summary}</p>
          {sec.refs.length > 0 ? (
            <ul className="mt-1 ml-3 list-disc space-y-0.5 text-sm">
              {sec.refs.map((r) => (
                <li key={`${sec.key}-${r.kind}-${r.id}`}>
                  <Link
                    href={doctorLfkTemplateUsageHref(r)}
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

function SortableRow({
  line,
  firstMedia,
  onChange,
  onRemove,
}: {
  line: EditorLine;
  firstMedia: ExerciseMedia | null;
  onChange: (sortId: string, patch: Partial<EditorLine>) => void;
  onRemove: (sortId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.sortId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex w-full items-stretch gap-2 rounded-lg border border-border/70 bg-card p-3 md:items-end"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="max-md:mt-0.5 shrink-0 cursor-grab self-start text-muted-foreground md:self-end"
        aria-label="Перетащить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </Button>
      <div className="flex w-9 shrink-0 flex-col self-stretch md:self-end">
        {firstMedia ? (
          <div className="relative min-h-9 flex-1 overflow-hidden rounded border border-border/40 bg-muted/30 md:h-9 md:flex-none">
            <MediaThumb
              media={exerciseMediaToPreviewUi(firstMedia)}
              className="absolute inset-0 size-full md:relative md:inset-auto"
              imgClassName="size-full object-cover"
              sizes="36px"
            />
          </div>
        ) : (
          <div className="min-h-9 flex-1 rounded bg-muted md:h-9 md:flex-none" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
        <p className="text-sm font-medium leading-tight md:max-w-[min(100%,24rem)] md:shrink-0">
          {line.title}
        </p>
        <div className="flex min-w-0 w-full flex-1 flex-wrap items-end gap-2 md:w-auto">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Повторы</Label>
            <Input
              className="h-8 w-16"
              inputMode="numeric"
              value={line.reps}
              onChange={(ev) => onChange(line.sortId, { reps: ev.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Подходы</Label>
            <Input
              className="h-8 w-16"
              inputMode="numeric"
              value={line.sets}
              onChange={(ev) => onChange(line.sortId, { sets: ev.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Сторона</Label>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={line.side}
              onChange={(ev) => onChange(line.sortId, { side: ev.target.value })}
            >
              <option value="">—</option>
              <option value="left">Левая</option>
              <option value="right">Правая</option>
              <option value="both">Обе</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Боль max</Label>
            <Input
              className="h-8 w-16"
              inputMode="numeric"
              value={line.maxPain}
              onChange={(ev) => onChange(line.sortId, { maxPain: ev.target.value })}
            />
          </div>
          <div className="flex min-w-[min(100%,10rem)] flex-1 basis-[10rem] flex-col gap-1">
            <Label className="text-xs">Комментарий</Label>
            <Input
              className="min-w-0"
              value={line.comment}
              onChange={(ev) => onChange(line.sortId, { comment: ev.target.value })}
            />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(line.sortId)}>
            Удалить
          </Button>
        </div>
      </div>
    </li>
  );
}

type TemplateEditorProps = {
  template: Template;
  exerciseCatalog: ExerciseOption[];
  /** Снимок «где используется» с RSC (страница `/lfk-templates/[id]`); в split-view не передаётся — подгрузка на клиенте. */
  externalUsageSnapshot?: LfkTemplateUsageSnapshot;
  /** Строка query (без `?`) для сохранения фильтров списка после архивации и редиректа на каталог. */
  listPreserveQuery?: string;
};

export function TemplateEditor({
  template,
  exerciseCatalog,
  externalUsageSnapshot,
  listPreserveQuery = "",
}: TemplateEditorProps) {
  const recordKey = template.id;
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description ?? "");
  const [lines, setLines] = useState<EditorLine[]>(() => templateToLines(template));
  const [addOpen, setAddOpen] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [usage, setUsage] = useState<LfkTemplateUsageSnapshot | null>(null);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [archiveUsageAck, setArchiveUsageAck] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setTitle(template.title);
    setDescription(template.description ?? "");
    setLines(templateToLines(template));
    setUsageLoadError(null);
    setWarnOpen(false);
    setArchiveUsageAck(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- полный сброс при смене редактируемого шаблона
  }, [recordKey]);

  useEffect(() => {
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      return;
    }
    let cancelled = false;
    setUsageLoadError(null);
    setUsageBusy(true);
    void fetchDoctorLfkTemplateUsageSnapshot(template.id)
      .then((u) => {
        if (!cancelled) setUsage(u);
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
  }, [template.id, externalUsageSnapshot]);

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveDoctorLfkTemplate,
    null as ArchiveDoctorLfkTemplateState | null,
  );

  useEffect(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      setWarnOpen(true);
    }
  }, [archiveState]);

  const usageSections = useMemo(() => {
    if (!usage || !lfkTemplateUsageHasAnyReference(usage)) return [];
    return lfkTemplateUsageSections(usage);
  }, [usage]);

  const warnSections = useMemo(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      const u = archiveState.usage;
      if (!lfkTemplateUsageHasAnyReference(u)) return [];
      return lfkTemplateUsageSections(u);
    }
    return [];
  }, [archiveState]);

  const archiveError =
    archiveState?.ok === false && "error" in archiveState ? archiveState.error : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortIds = useMemo(() => lines.map((l) => l.sortId), [lines]);

  const catalogById = useMemo(() => {
    const m = new Map<string, ExerciseMedia | null>();
    for (const e of exerciseCatalog) {
      m.set(e.id, e.firstMedia);
    }
    return m;
  }, [exerciseCatalog]);

  const onDragEnd = useCallback((ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    setLines((prev) => {
      const oldIndex = prev.findIndex((l) => l.sortId === active.id);
      const newIndex = prev.findIndex((l) => l.sortId === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const updateLine = useCallback((sortId: string, patch: Partial<EditorLine>) => {
    setLines((prev) => prev.map((l) => (l.sortId === sortId ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((sortId: string) => {
    setLines((prev) => prev.filter((l) => l.sortId !== sortId));
  }, []);

  const persist = useCallback(() => {
    const t = title.trim();
    if (!t) {
      toast.error("Укажите название шаблона");
      return;
    }
    startTransition(async () => {
      const res = await persistLfkTemplateDraft({
        templateId: template.id,
        title: t,
        description: description.trim() || null,
        exercises: linesToPayload(lines),
      });
      if (!res.ok) toast.error(res.error);
      else toast.success("Черновик сохранён");
    });
  }, [description, lines, template.id, title]);

  const publish = useCallback(() => {
    startTransition(async () => {
      const saveFirst = await persistLfkTemplateDraft({
        templateId: template.id,
        title: title.trim() || template.title,
        description: description.trim() || null,
        exercises: linesToPayload(lines),
      });
      if (!saveFirst.ok) {
        toast.error(saveFirst.error);
        return;
      }
      const res = await publishLfkTemplateAction(template.id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Шаблон опубликован");
    });
  }, [description, lines, template.id, template.title, title]);

  const filteredPick = useMemo(() => {
    const needle = normalizeRuSearchString(pickQuery.trim());
    const used = new Set(lines.map((l) => l.exerciseId));
    return exerciseCatalog.filter(
      (e) => !used.has(e.id) && (!needle || normalizeRuSearchString(e.title).includes(needle)),
    );
  }, [exerciseCatalog, lines, pickQuery]);

  const addExercise = useCallback((opt: ExerciseOption) => {
    setLines((prev) => [
      ...prev,
      {
        sortId: crypto.randomUUID(),
        exerciseId: opt.id,
        title: opt.title,
        reps: "",
        sets: "",
        side: "",
        maxPain: "",
        comment: "",
      },
    ]);
    setAddOpen(false);
    setPickQuery("");
  }, []);

  const archived = template.status === "archived";

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tpl-title">Название</Label>
        <Input
          id="tpl-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={archived}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tpl-desc">Описание</Label>
        <Textarea
          id="tpl-desc"
          className="min-h-[80px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={archived}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger
            render={<Button type="button" variant="secondary" disabled={archived} />}
          >
            Добавить упражнение
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Выбор из справочника</DialogTitle>
            </DialogHeader>
            <PickerSearchField
              id="tpl-exercise-pick-search"
              label="Поиск по названию"
              placeholder="Название упражнения"
              value={pickQuery}
              onValueChange={setPickQuery}
              className="min-w-0"
            />
            <ul className="max-h-64 overflow-auto">
              {filteredPick.length === 0 ? (
                <li className="text-sm text-muted-foreground">Нет доступных упражнений</li>
              ) : (
                filteredPick.map((e) => (
                  <li key={e.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start gap-2 rounded-md px-2 py-2 text-left text-sm font-normal"
                      onClick={() => addExercise(e)}
                    >
                      <ExerciseListCatalogThumb media={e.firstMedia} />
                      <span className="line-clamp-2 min-w-0">{e.title}</span>
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </DialogContent>
        </Dialog>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <SortableRow
                key={line.sortId}
                line={line}
                firstMedia={catalogById.get(line.exerciseId) ?? null}
                onChange={updateLine}
                onRemove={removeLine}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
        <Button type="button" onClick={persist} disabled={archived || pending}>
          Сохранить черновик
        </Button>
        <Button type="button" variant="default" onClick={publish} disabled={archived || pending}>
          Опубликовать
        </Button>
      </div>

      {!archived ? (
        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : !usage ? null : !lfkTemplateUsageHasAnyReference(usage) ? (
              <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>
            ) : (
              <LfkTemplateUsageSectionsView sections={usageSections} />
            )}
          </div>

          {archiveError ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}

          <form ref={archiveFormRef} action={archiveFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={template.id} />
            <input type="hidden" name="listPreserveQuery" value={listPreserveQuery} />
            <input type="hidden" name="acknowledgeUsageWarning" value={archiveUsageAck ? "1" : ""} readOnly />
            <Button
              type="submit"
              variant="destructive"
              disabled={archivePending || pending}
              onClick={() => {
                setArchiveUsageAck(false);
              }}
            >
              {archivePending ? "Архивация…" : "Архивировать"}
            </Button>
          </form>

          <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
            <DialogContent showCloseButton className="max-w-md">
              <DialogHeader>
                <DialogTitle>Комплекс уже используется</DialogTitle>
                <div className="space-y-2 text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground">
                  <span className="block">
                    Архивация уберёт комплекс из каталога для новых назначений. Уже выданные назначения и история не
                    удаляются.
                  </span>
                  {!warnSections.length &&
                  archiveState?.ok === false &&
                  "code" in archiveState &&
                  archiveState.code === "USAGE_CONFIRMATION_REQUIRED" &&
                  !lfkTemplateUsageHasAnyReference(archiveState.usage) ? (
                    <span className="block text-sm">
                      Сервер запросил подтверждение — проверьте связи перед архивацией.
                    </span>
                  ) : warnSections.length ? (
                    <LfkTemplateUsageSectionsView sections={warnSections} />
                  ) : null}
                </div>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" onClick={() => setWarnOpen(false)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archivePending}
                  onClick={() => {
                    setArchiveUsageAck(true);
                    setWarnOpen(false);
                    queueMicrotask(() => {
                      archiveFormRef.current?.requestSubmit();
                      setArchiveUsageAck(false);
                    });
                  }}
                >
                  Архивировать всё равно
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Перед публикацией черновик сохраняется автоматически. Если в базе нет упражнений в шаблоне, опубликация
        будет отклонена.
      </p>
    </div>
  );
}
