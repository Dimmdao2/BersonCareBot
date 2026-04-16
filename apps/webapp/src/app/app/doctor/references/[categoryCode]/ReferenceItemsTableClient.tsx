"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { saveReferenceCatalog } from "../actions";

type Row = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  isNew?: boolean;
};

function DragHandle({ listeners, attributes }: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) {
  return (
    <button
      type="button"
      aria-label="Перетащить"
      className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded border border-border text-muted-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <span className="flex flex-col gap-0.5" aria-hidden>
        <span className="h-0.5 w-4 rounded-full bg-current" />
        <span className="h-0.5 w-4 rounded-full bg-current" />
        <span className="h-0.5 w-4 rounded-full bg-current" />
      </span>
    </button>
  );
}

function SortableRow({
  row,
  index,
  onChange,
  onToggleArchive,
}: {
  row: Row;
  index: number;
  onChange: (rowId: string, patch: Partial<Row>) => void;
  onToggleArchive: (rowId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border align-middle">
      <td className="px-2 py-2 text-center text-sm text-muted-foreground">{index + 1}</td>
      <td className="px-2 py-2">
        <DragHandle listeners={listeners as never} attributes={attributes as never} />
      </td>
      <td className="px-2 py-2">
        <Input value={row.code} readOnly={!row.isNew} onChange={(e) => onChange(row.id, { code: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <Input value={row.title} onChange={(e) => onChange(row.id, { title: e.target.value })} />
      </td>
      <td className="px-2 py-2 text-center text-xs text-muted-foreground">{row.isActive ? "Активна" : "Архив"}</td>
      <td className="px-2 py-2 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Действия"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onToggleArchive(row.id)}>
              {row.isActive ? "Архивировать" : "Восстановить"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

type Props = {
  categoryCode: string;
  initialItems: Array<{ id: string; code: string; title: string; sortOrder: number; isActive: boolean }>;
};

export function ReferenceItemsTableClient({ categoryCode, initialItems }: Props) {
  const router = useRouter();
  const normalizedInitialRows = useMemo(
    () => [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder).map((item, idx) => ({ ...item, sortOrder: idx + 1 })),
    [initialItems]
  );
  const [rows, setRows] = useState<Row[]>(normalizedInitialRows);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initialState = useMemo(() => JSON.stringify(normalizedInitialRows), [normalizedInitialRows]);
  const isDirty = JSON.stringify(rows) !== initialState;

  useEffect(() => {
    setRows(normalizedInitialRows);
  }, [normalizedInitialRows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((row) => row.id === active.id);
      const newIndex = prev.findIndex((row) => row.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((row, idx) => ({ ...row, sortOrder: idx + 1 }));
    });
  };

  const onChange = (rowId: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const onToggleArchive = (rowId: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, isActive: !row.isActive } : row)));
  };

  const onAdd = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        code: "",
        title: "",
        sortOrder: prev.length + 1,
        isActive: true,
        isNew: true,
      },
    ]);
  };

  const onSave = () => {
    setError(null);
    if (rows.some((row) => !row.title.trim())) {
      setError("Название не может быть пустым");
      return;
    }
    if (rows.some((row) => row.isNew && !/^[a-z][a-z0-9_]*$/.test(row.code.trim()))) {
      setError("Код новой строки должен быть в lower_snake_case");
      return;
    }
    startTransition(async () => {
      try {
        const updates = rows
          .filter((row) => !row.isNew)
          .map((row) => ({ id: row.id, title: row.title.trim(), sortOrder: row.sortOrder, isActive: row.isActive }));
        const additions = rows
          .filter((row) => row.isNew)
          .map((row) => ({ code: row.code.trim(), title: row.title.trim(), sortOrder: row.sortOrder }));
        await saveReferenceCatalog({ categoryCode, updates, additions });
        router.refresh();
      } catch {
        setError("Не удалось сохранить справочник");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" onClick={onAdd}>
          Добавить строку
        </Button>
        <Button type="button" onClick={onSave} disabled={isPending || !isDirty}>
          Сохранить справочник
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="w-14 px-2 py-2">#</th>
                  <th className="w-14 px-2 py-2" />
                  <th className="px-2 py-2">Код</th>
                  <th className="px-2 py-2">Название</th>
                  <th className="w-28 px-2 py-2 text-center">Статус</th>
                  <th className="w-16 px-2 py-2 text-right">...</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <SortableRow key={row.id} row={row} index={idx} onChange={onChange} onToggleArchive={onToggleArchive} />
                ))}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
