"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  archiveLfkTemplateAction,
  persistLfkTemplateDraft,
  publishLfkTemplateAction,
} from "./actions";
import { editorLinesToTemplateExerciseInputs } from "./templateExercisePayload";

type ExerciseOption = { id: string; title: string };

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

function SortableRow({
  line,
  onChange,
  onRemove,
}: {
  line: EditorLine;
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
      className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 cursor-grab text-muted-foreground"
        aria-label="Перетащить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{line.title}</p>
        <p className="text-xs text-muted-foreground">{line.exerciseId}</p>
      </div>
      <div className="flex flex-wrap gap-2">
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
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <Label className="text-xs">Комментарий</Label>
          <Input
            value={line.comment}
            onChange={(ev) => onChange(line.sortId, { comment: ev.target.value })}
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(line.sortId)}>
          Удалить
        </Button>
      </div>
    </li>
  );
}

type TemplateEditorProps = {
  template: Template;
  exerciseCatalog: ExerciseOption[];
};

export function TemplateEditor({ template, exerciseCatalog }: TemplateEditorProps) {
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description ?? "");
  const [lines, setLines] = useState<EditorLine[]>(() => templateToLines(template));
  const [addOpen, setAddOpen] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortIds = useMemo(() => lines.map((l) => l.sortId), [lines]);

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
    const q = pickQuery.trim().toLowerCase();
    const used = new Set(lines.map((l) => l.exerciseId));
    return exerciseCatalog.filter((e) => !used.has(e.id) && (!q || e.title.toLowerCase().includes(q)));
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
    <div className="flex max-w-4xl flex-col gap-6">
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
            <Input
              placeholder="Поиск по названию"
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
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
                      className="h-auto w-full justify-start rounded-md px-2 py-2 text-left text-sm font-normal"
                      onClick={() => addExercise(e)}
                    >
                      {e.title}
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
              <SortableRow key={line.sortId} line={line} onChange={updateLine} onRemove={removeLine} />
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
        {template.status !== "archived" ? (
          <form action={archiveLfkTemplateAction.bind(null, template.id)}>
            <Button type="submit" variant="destructive" disabled={pending}>
              Архивировать
            </Button>
          </form>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Перед публикацией черновик сохраняется автоматически. Если в базе нет упражнений в шаблоне, опубликация
        будет отклонена.
      </p>
    </div>
  );
}
