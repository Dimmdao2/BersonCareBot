"use client";

import { useState, useTransition } from "react";
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canManageItemsForBlock } from "@/modules/patient-home/blocks";
import type { PatientHomeBlock } from "@/modules/patient-home/ports";
import { togglePatientHomeBlockVisibility } from "./actions";
import { PatientHomeAddItemDialog } from "./PatientHomeAddItemDialog";
import { PatientHomeBlockItemsDialog } from "./PatientHomeBlockItemsDialog";
import { PatientHomeBlockPreview } from "./PatientHomeBlockPreview";

type KnownRefs = {
  contentPages: string[];
  contentSections: string[];
  courses: string[];
};

export function PatientHomeBlockSettingsCard({
  block,
  knownRefs,
  onChanged,
}: {
  block: PatientHomeBlock;
  knownRefs: KnownRefs;
  onChanged(): void;
}) {
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManageItems = canManageItemsForBlock(block.code);

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const res = await togglePatientHomeBlockVisibility(block.code, !block.isVisible);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChanged();
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{block.title}</div>
          <div className="text-xs text-muted-foreground">{block.code}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-9 items-center justify-center rounded-md border border-transparent hover:bg-muted"
            aria-label="Действия блока"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>Действия</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleToggle} disabled={isPending}>
              {block.isVisible ? "Скрыть" : "Показать"}
            </DropdownMenuItem>
            {canManageItems ? (
              <DropdownMenuItem onClick={() => setAddOpen(true)}>
                Добавить материал
              </DropdownMenuItem>
            ) : null}
            {canManageItems ? (
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Изменить
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PatientHomeBlockPreview items={block.items} knownRefs={knownRefs} />
      {error ? <div className="mt-2 text-sm text-destructive">{error}</div> : null}
      {addOpen ? (
        <PatientHomeAddItemDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          blockCode={block.code}
          onSaved={onChanged}
        />
      ) : null}
      {editOpen ? (
        <PatientHomeBlockItemsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          blockCode={block.code}
          initialItems={block.items}
          onSaved={onChanged}
        />
      ) : null}
    </section>
  );
}
