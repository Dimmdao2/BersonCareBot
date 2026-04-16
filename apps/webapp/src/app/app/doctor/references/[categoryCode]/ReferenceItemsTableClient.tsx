"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
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
import { EllipsisVertical, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveReferenceCatalog,
  softDeleteReferenceItem,
  type SaveReferenceCatalogResult,
  type SoftDeleteReferenceItemResult,
} from "../actions";

type ReferenceErrorDialog = {
  title: string;
  summary: string;
  /** Дополнительный текст (например подсказка); без «сырого» ответа Next.js в production. */
  detail?: string;
};

function dialogForSaveFailure(result: Extract<SaveReferenceCatalogResult, { ok: false }>): ReferenceErrorDialog {
  switch (result.code) {
    case "duplicate_code":
      return {
        title: "Ошибка сохранения",
        summary:
          "Код уже существует: в справочнике уже есть строка с таким кодом, либо среди новых строк указан один код дважды.",
      };
    case "invalid_add_payload":
    case "invalid_update_payload":
      return {
        title: "Ошибка сохранения",
        summary: result.invalidValue
          ? `Недопустимое значение: ${result.invalidValue}`
          : "Недопустимое значение.",
      };
    case "category_not_found":
    case "item_not_found":
      return {
        title: "Ошибка сохранения",
        summary: "Данные устарели или строка не найдена. Обновите страницу и попробуйте сохранить снова.",
      };
    case "category_not_extensible":
      return {
        title: "Ошибка сохранения",
        summary: "В этот справочник нельзя добавлять новые значения из интерфейса.",
      };
    case "category_required":
    case "empty_update":
      return {
        title: "Ошибка сохранения",
        summary: "Не удалось выполнить запрос. Обновите страницу и попробуйте снова.",
      };
    case "save_failed":
    default:
      return {
        title: "Ошибка сохранения",
        summary: "Ошибка соединения с сервером или временный сбой. Попробуйте ещё раз.",
      };
  }
}

function dialogForDeleteFailure(
  result: Extract<SoftDeleteReferenceItemResult, { ok: false }>,
): ReferenceErrorDialog {
  switch (result.code) {
    case "item_required":
    case "category_required":
      return {
        title: "Ошибка удаления",
        summary: "Не удалось выполнить запрос. Обновите страницу и попробуйте снова.",
      };
    case "delete_failed":
    default:
      return {
        title: "Ошибка удаления",
        summary: "Ошибка соединения с сервером или временный сбой. Попробуйте ещё раз.",
      };
  }
}

type Row = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  isNew?: boolean;
};

type StatusFilter = "all" | "active" | "archived";

function matchesStatusFilter(row: Row, statusFilter: StatusFilter): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "active") return row.isActive;
  return !row.isActive;
}

function matchesSearch(row: Row, qTrimmed: string): boolean {
  if (qTrimmed.length < 3) return true;
  const ql = qTrimmed.toLowerCase();
  return row.title.toLowerCase().includes(ql) || row.code.toLowerCase().includes(ql);
}

function filterRows(rows: Row[], statusFilter: StatusFilter, qTrimmed: string): Row[] {
  return rows.filter((r) => matchesStatusFilter(r, statusFilter) && matchesSearch(r, qTrimmed));
}

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
  onToggleActive,
  onSoftDelete,
}: {
  row: Row;
  index: number;
  onChange: (rowId: string, patch: Partial<Row>) => void;
  onToggleActive: (rowId: string) => void;
  onSoftDelete: (rowId: string) => void;
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
        <div className="flex min-w-0 flex-col gap-1">
          {row.isNew ? (
            <Input
              value={row.code}
              placeholder="код_snake_case"
              className="h-8 font-mono text-xs"
              onChange={(e) => onChange(row.id, { code: e.target.value })}
            />
          ) : null}
          <Input value={row.title} onChange={(e) => onChange(row.id, { title: e.target.value })} />
        </div>
      </td>
      <td className="px-2 py-2 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full border border-border/80"
          title={row.isActive ? "Активна" : "В архиве"}
          aria-label={row.isActive ? "Активна" : "В архиве"}
          onClick={() => onToggleActive(row.id)}
        >
          {row.isActive ? (
            <Eye className="size-4 text-green-600 dark:text-green-500" aria-hidden />
          ) : (
            <EyeOff className="size-4 text-muted-foreground" aria-hidden />
          )}
        </Button>
      </td>
      <td className="px-2 py-2 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Действия"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSoftDelete(row.id)}>Удалить</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

type Props = {
  categoryTitle: string;
  categoryCode: string;
  initialItems: Array<{ id: string; code: string; title: string; sortOrder: number; isActive: boolean }>;
};

export function ReferenceItemsTableClient({ categoryTitle, categoryCode, initialItems }: Props) {
  const router = useRouter();
  const normalizedInitialRows = useMemo(
    () => [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder).map((item, idx) => ({ ...item, sortOrder: idx + 1 })),
    [initialItems]
  );
  const [rows, setRows] = useState<Row[]>(normalizedInitialRows);
  const [isPending, startTransition] = useTransition();
  const [errorDialog, setErrorDialog] = useState<ReferenceErrorDialog | null>(null);
  const [searchRaw, setSearchRaw] = useState("");
  const deferredSearch = useDeferredValue(searchRaw);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const qTrimmed = deferredSearch.trim();
  const filteredRows = useMemo(
    () => filterRows(rows, statusFilter, qTrimmed),
    [rows, statusFilter, qTrimmed]
  );

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
      const vis = filterRows(prev, statusFilter, qTrimmed);
      const oldIndex = vis.findIndex((r) => r.id === active.id);
      const newIndex = vis.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const movedVis = arrayMove(vis, oldIndex, newIndex);
      const indices: number[] = [];
      prev.forEach((r, i) => {
        if (vis.some((v) => v.id === r.id)) indices.push(i);
      });
      const next = [...prev];
      movedVis.forEach((r, j) => {
        next[indices[j]] = { ...r };
      });
      return next.map((r, idx) => ({ ...r, sortOrder: idx + 1 }));
    });
  };

  const onChange = (rowId: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const onToggleActive = (rowId: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, isActive: !row.isActive } : row)));
  };

  const onSoftDeleteRow = (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    if (row.isNew) {
      setRows((prev) => prev.filter((r) => r.id !== rowId).map((r, idx) => ({ ...r, sortOrder: idx + 1 })));
      return;
    }
    startTransition(async () => {
      setErrorDialog(null);
      try {
        const fd = new FormData();
        fd.set("categoryCode", categoryCode);
        fd.set("itemId", rowId);
        const delResult = await softDeleteReferenceItem(fd);
        if (!delResult.ok) {
          setErrorDialog(dialogForDeleteFailure(delResult));
          return;
        }
        setRows((prev) => prev.filter((r) => r.id !== rowId).map((r, idx) => ({ ...r, sortOrder: idx + 1 })));
        router.refresh();
      } catch {
        setErrorDialog({
          title: "Ошибка удаления",
          summary: "Ошибка соединения с сервером. Проверьте подключение и попробуйте снова.",
        });
      }
    });
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
    setErrorDialog(null);
    if (rows.some((row) => !row.isNew && !row.title.trim())) {
      setErrorDialog({
        title: "Ошибка сохранения",
        summary: "У существующей строки не может быть пустого названия.",
        detail:
          "Источник: проверка на клиенте.\nПравило: для уже сохранённых позиций название обязательно (пробелы по краям не считаются).",
      });
      return;
    }
    const newRowsToPersist = rows.filter((row) => row.isNew && (row.code.trim() !== "" || row.title.trim() !== ""));
    if (newRowsToPersist.some((row) => !/^[a-z][a-z0-9_]*$/.test(row.code.trim()))) {
      setErrorDialog({
        title: "Ошибка сохранения",
        summary: "Код новой строки должен быть в формате lower_snake_case.",
        detail:
          "Источник: проверка на клиенте.\nПравило: код начинается с латинской буквы в нижнем регистре, далее только a–z, цифры и подчёркивание (пример: body_region).\nПолностью пустые новые строки (без кода и без названия) при сохранении не отправляются.",
      });
      return;
    }
    if (newRowsToPersist.some((row) => !row.title.trim())) {
      setErrorDialog({
        title: "Ошибка сохранения",
        summary: "Для новой строки с указанным кодом нужно заполнить название.",
        detail:
          "Источник: проверка на клиенте.\nПравило: если для новой строки задан код, название не может быть пустым.\nПолностью пустые новые строки при сохранении не отправляются.",
      });
      return;
    }
    startTransition(async () => {
      try {
        const updates = rows
          .filter((row) => !row.isNew)
          .map((row) => ({ id: row.id, title: row.title.trim(), sortOrder: row.sortOrder, isActive: row.isActive }));
        const additions = newRowsToPersist.map((row) => ({
          code: row.code.trim(),
          title: row.title.trim(),
          sortOrder: row.sortOrder,
        }));
        const normalizedCodes = additions.map((row) => row.code.toLowerCase());
        if (new Set(normalizedCodes).size !== normalizedCodes.length) {
          setErrorDialog({
            title: "Ошибка сохранения",
            summary: "Коды новых строк должны быть уникальными внутри сохраняемого набора.",
            detail:
              "Источник: проверка на клиенте.\nУ двух или более новых строк совпадает код (без учёта регистра). Исправьте дубликаты и сохраните снова.",
          });
          return;
        }
        const saveResult = await saveReferenceCatalog({ categoryCode, updates, additions });
        if (!saveResult.ok) {
          setErrorDialog(dialogForSaveFailure(saveResult));
          return;
        }
        router.refresh();
      } catch {
        setErrorDialog({
          title: "Ошибка сохранения",
          summary: "Ошибка соединения с сервером. Проверьте подключение и попробуйте снова.",
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Dialog
        open={errorDialog !== null}
        onOpenChange={(open) => {
          if (!open) setErrorDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {errorDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>{errorDialog.title}</DialogTitle>
                <DialogDescription>{errorDialog.summary}</DialogDescription>
              </DialogHeader>
              {errorDialog.detail ? (
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-words text-foreground">
                  {errorDialog.detail}
                </pre>
              ) : null}
              <DialogFooter className="sm:justify-end">
                <Button type="button" onClick={() => setErrorDialog(null)}>
                  ОК
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)] z-20 -mx-4 flex flex-col gap-3 border-b border-border bg-card px-4 pb-3 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-lg font-semibold">{categoryTitle}</h1>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Input
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Поиск от 3 букв (название или код)"
              className="h-9 w-56 sm:w-64"
              aria-label="Поиск по названию или коду"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-[11rem]" aria-label="Фильтр по статусу">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="archived">Архивные</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onAdd}>
            Добавить строку
          </Button>
          <Button type="button" onClick={onSave} disabled={isPending || !isDirty}>
            Сохранить справочник
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет строк в справочнике.</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет строк по текущему фильтру.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={filteredRows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="w-14 px-2 py-2">#</th>
                    <th className="w-14 px-2 py-2" />
                    <th className="px-2 py-2">Название</th>
                    <th className="w-28 px-2 py-2 text-center">Статус</th>
                    <th className="w-16 px-2 py-2 text-right">...</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      index={idx}
                      onChange={onChange}
                      onToggleActive={onToggleActive}
                      onSoftDelete={onSoftDeleteRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
