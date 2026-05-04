"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { ClinicalTestMediaItem, TestSet } from "@/modules/tests/types";
import type { ClinicalTestLibraryPickRow } from "./clinicalTestLibraryRows";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { clinicalTestMediaItemToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";

export type TestSetEditorItemRow = {
  sortId: string;
  testId: string;
  title: string;
  comment: string;
  testArchived: boolean;
  previewMedia: ClinicalTestMediaItem | null;
};

export function rowsFromTestSet(ts: TestSet): TestSetEditorItemRow[] {
  return [...ts.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({
      sortId: it.id,
      testId: it.testId,
      title: it.test.title,
      comment: it.comment ?? "",
      testArchived: it.test.isArchived,
      previewMedia: it.test.previewMedia,
    }));
}

type Props = {
  testSet: TestSet;
  clinicalTestsLibrary: ClinicalTestLibraryPickRow[];
  rows: TestSetEditorItemRow[];
  setRows: Dispatch<SetStateAction<TestSetEditorItemRow[]>>;
};

function SortableRow({
  row,
  onChange,
  onRemove,
}: {
  row: TestSetEditorItemRow;
  onChange: (sortId: string, patch: Partial<Pick<TestSetEditorItemRow, "comment">>) => void;
  onRemove: (sortId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.sortId,
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
      className="flex w-full flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 sm:flex-row sm:items-stretch sm:gap-2"
    >
      <div className="flex shrink-0 gap-2 sm:flex-col sm:items-stretch">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 cursor-grab text-muted-foreground"
          aria-label="Перетащить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </Button>
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30">
          {row.previewMedia ? (
            <MediaThumb
              media={clinicalTestMediaItemToPreviewUi(row.previewMedia)}
              className="absolute inset-0 size-full"
              imgClassName="size-full object-cover"
              sizes="48px"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">—</div>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium leading-tight">{row.title}</p>
          {row.testArchived ? (
            <Badge variant="secondary" className="text-xs">
              Тест в архиве — удалите из набора перед сохранением
            </Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label className="text-xs" htmlFor={`ts-cmt-${row.sortId}`}>
            Комментарий к позиции
          </Label>
          <Textarea
            id={`ts-cmt-${row.sortId}`}
            className="min-h-[56px] resize-y text-sm"
            value={row.comment}
            onChange={(ev) => onChange(row.sortId, { comment: ev.target.value })}
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(row.sortId)}>
            Удалить из набора
          </Button>
        </div>
      </div>
    </li>
  );
}

export function TestSetItemsForm({ testSet, clinicalTestsLibrary, rows, setRows }: Props) {
  const [libOpen, setLibOpen] = useState(false);
  const [pickQuery, setPickQuery] = useState("");

  const updateRow = useCallback((sortId: string, patch: Partial<TestSetEditorItemRow>) => {
    setRows((prev) => prev.map((r) => (r.sortId === sortId ? { ...r, ...patch } : r)));
  }, [setRows]);

  const removeRow = useCallback(
    (sortId: string) => {
      setRows((prev) => prev.filter((r) => r.sortId !== sortId));
    },
    [setRows],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortIds = useMemo(() => rows.map((r) => r.sortId), [rows]);

  const onDragEnd = useCallback(
    (ev: DragEndEvent) => {
      const { active, over } = ev;
      if (!over || active.id === over.id) return;
      setRows((prev) => {
        const oldIndex = prev.findIndex((l) => l.sortId === active.id);
        const newIndex = prev.findIndex((l) => l.sortId === over.id);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [setRows],
  );

  const byTestId = useMemo(() => new Map(clinicalTestsLibrary.map((r) => [r.id, r])), [clinicalTestsLibrary]);

  const filteredPick = useMemo(() => {
    const needle = normalizeRuSearchString(pickQuery.trim());
    const used = new Set(rows.map((r) => r.testId));
    return clinicalTestsLibrary
      .filter((t) => !used.has(t.id) && (!needle || normalizeRuSearchString(t.title).includes(needle)))
      .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }, [clinicalTestsLibrary, rows, pickQuery]);

  const addTest = useCallback(
    (id: string) => {
      const opt = byTestId.get(id);
      if (!opt) return;
      setRows((prev) => [
        ...prev,
        {
          sortId: crypto.randomUUID(),
          testId: opt.id,
          title: opt.title,
          comment: "",
          testArchived: false,
          previewMedia: opt.previewMedia,
        },
      ]);
      setLibOpen(false);
      setPickQuery("");
    },
    [byTestId, setRows],
  );

  return (
    <div className="flex flex-col gap-3">
      <fieldset disabled={testSet.isArchived} className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Позиции набора тестов</legend>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <SortableRow key={row.sortId} row={row} onChange={updateRow} onRemove={removeRow} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <Dialog open={libOpen} onOpenChange={setLibOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTrigger render={<Button type="button" variant="secondary" disabled={testSet.isArchived} />}>
              Добавить тест
            </DialogTrigger>
          </div>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Выбор из справочника</DialogTitle>
            </DialogHeader>
            <PickerSearchField
              id={`ts-lib-search-${testSet.id}`}
              label="Поиск по названию"
              placeholder="Название теста"
              value={pickQuery}
              onValueChange={setPickQuery}
              className="min-w-0"
            />
            <ul className="max-h-64 overflow-auto">
              {filteredPick.length === 0 ? (
                <li className="text-sm text-muted-foreground">Нет доступных тестов.</li>
              ) : (
                filteredPick.map((row) => (
                  <li key={row.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start gap-2 rounded-md px-2 py-2 text-left text-sm font-normal"
                      onClick={() => addTest(row.id)}
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30">
                        {row.previewMedia ? (
                          <MediaThumb
                            media={clinicalTestMediaItemToPreviewUi(row.previewMedia)}
                            className="absolute inset-0 size-full"
                            imgClassName="size-full object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                      <span className="line-clamp-2 min-w-0 font-medium leading-snug">{row.title}</span>
                    </Button>
                  </li>
                ))
              )}
            </ul>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLibOpen(false)}>
                Закрыть
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </fieldset>
    </div>
  );
}
