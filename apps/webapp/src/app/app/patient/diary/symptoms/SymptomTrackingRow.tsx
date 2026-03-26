"use client";

import { useState } from "react";
import { MoreVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { archiveSymptomTracking, deleteSymptomTracking, renameSymptomTracking } from "./actions";

export function SymptomTrackingRow({ id, title }: { id: string; title: string }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const archiveFormId = `archive-tracking-${id}`;
  const deleteFormId = `delete-tracking-${id}`;

  return (
    <li id={`patient-symptoms-tracking-item-${id}`} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-2">
      <strong>{title ?? "—"}</strong>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Действия"
        >
          <MoreVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>Переименовать</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              const el = document.getElementById(archiveFormId);
              if (el instanceof HTMLFormElement) el.requestSubmit();
            }}
          >
            Архивировать
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>Удалить…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <form id={archiveFormId} action={archiveSymptomTracking} className="hidden" aria-hidden>
        <input type="hidden" name="trackingId" value={id} />
        <input type="submit" tabIndex={-1} value="submit" className="sr-only" aria-hidden />
      </form>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать симптом</DialogTitle>
          </DialogHeader>
          <form action={renameSymptomTracking} className="flex flex-col gap-3">
            <input type="hidden" name="trackingId" value={id} />
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
              <Button type="submit">Сохранить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить симптом?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Запись будет скрыта из списка. История дневника сохранится для врача при необходимости.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const el = document.getElementById(deleteFormId);
                if (el instanceof HTMLFormElement) el.requestSubmit();
                setDeleteOpen(false);
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
          <form id={deleteFormId} action={deleteSymptomTracking} className="sr-only" aria-hidden>
            <input type="hidden" name="trackingId" value={id} />
            <input type="submit" value="Удалить" className="sr-only" aria-hidden />
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}
