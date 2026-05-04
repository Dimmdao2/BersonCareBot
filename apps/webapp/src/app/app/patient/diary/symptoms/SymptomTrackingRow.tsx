"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { MoreVerticalIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumericChipGroup } from "@/components/common/controls/NumericChipGroup";
import { notifyDiarySymptomEntrySaved } from "@/modules/diaries/symptomDiaryClientEvents";
import { shouldConfirmInstantDuplicate, type LastSymptomSaveMeta } from "./symptomEntryDedup";
import { addSymptomEntry, archiveSymptomTracking, renameSymptomTracking } from "./actions";
import { cn } from "@/lib/utils";
import { patientListItemClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

export function SymptomTrackingRow({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [entryType, setEntryType] = useState<"instant" | "daily">("instant");
  const [notes, setNotes] = useState("");
  const lastSavedRef = useRef<LastSymptomSaveMeta | null>(null);

  useEffect(() => {
    setNewTitle(title);
  }, [title]);

  return (
    <li id={`patient-symptoms-tracking-item-${id}`} className={cn(patientListItemClass, "flex items-center justify-between gap-2")}>
      <strong>{title ?? "—"}</strong>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Добавить запись"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Действия"
          >
            <MoreVerticalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>Переименовать</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("trackingId", id);
                  try {
                    const result = await archiveSymptomTracking(fd);
                    if (result.ok) {
                      toast.success("Симптом архивирован");
                      router.refresh();
                    } else {
                      toast.error("Не удалось архивировать");
                    }
                  } catch {
                    toast.error("Не удалось архивировать");
                  }
                });
              }}
            >
              Архивировать
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить запись</DialogTitle>
            <DialogDescription>{title ?? "—"}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedValue === null) {
                toast.error("Выберите интенсивность");
                return;
              }
              if (shouldConfirmInstantDuplicate(lastSavedRef.current, id, entryType)) {
                if (!window.confirm("Вы только что сделали такую запись. Сохранить ещё одну?")) {
                  return;
                }
              }
              const fd = new FormData();
              fd.set("trackingId", id);
              fd.set("value", String(selectedValue));
              fd.set("entryType", entryType);
              fd.set("notes", notes);
              startTransition(async () => {
                const result = await addSymptomEntry(fd);
                if (result.ok) {
                  toast.success("Запись сохранена");
                  lastSavedRef.current = { trackingId: id, entryType, at: Date.now() };
                  setSelectedValue(null);
                  setEntryType("instant");
                  setNotes("");
                  setAddOpen(false);
                  notifyDiarySymptomEntrySaved();
                } else if (result.reason === "duplicate_instant") {
                  toast.error("Похожая запись в моменте уже сохранена только что");
                } else if (result.reason === "duplicate_daily") {
                  toast.error("Запись «за день» по этому симптому уже есть сегодня");
                } else {
                  toast.error("Не удалось сохранить");
                }
              });
            }}
          >
            <div className="flex flex-col gap-3">
              <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Интенсивность (0–10)</span>
              <NumericChipGroup min={0} max={10} value={selectedValue} onChange={setSelectedValue} />
            </div>
            <label className="flex flex-col gap-1">
              <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Тип записи</span>
              <Select
                value={entryType}
                onValueChange={(v) => v != null && setEntryType(v === "daily" ? "daily" : "instant")}
              >
                <SelectTrigger className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base shadow-none focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">В моменте</SelectItem>
                  <SelectItem value="daily">За день</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Заметки (необязательно)</span>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isPending || selectedValue === null}>
                {isPending ? "Сохраняю…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать симптом</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newTitle.trim();
              if (!trimmed) return;
              startTransition(async () => {
                const fd = new FormData();
                fd.set("trackingId", id);
                fd.set("newTitle", trimmed);
                try {
                  const result = await renameSymptomTracking(fd);
                  if (result.ok) {
                    toast.success("Название обновлено");
                    setRenameOpen(false);
                    router.refresh();
                  } else {
                    toast.error("Не удалось переименовать");
                  }
                } catch {
                  toast.error("Не удалось переименовать");
                }
              });
            }}
          >
            <Input
              name="newTitle"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              maxLength={200}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Сохраняю…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}
