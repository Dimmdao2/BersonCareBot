"use client";

import { useMemo, useState, useTransition } from "react";
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPatientHomeBlockEditorMetadata } from "@/modules/patient-home/blockEditorMetadata";
import { canManageItemsForBlock } from "@/modules/patient-home/blocks";
import type { PatientHomeBlock } from "@/modules/patient-home/ports";
import type { PatientHomeBlockRuntimeStatus } from "@/modules/patient-home/patientHomeRuntimeStatus";
import {
  listUnresolvedPatientHomeBlockItems,
  partitionUnresolvedPatientHomeItemsByVisibility,
} from "@/modules/patient-home/patientHomeUnresolvedRefs";
import { togglePatientHomeBlockVisibility } from "./actions";
import { PatientHomeAddItemDialog } from "./PatientHomeAddItemDialog";
import { PatientHomeBlockItemsDialog } from "./PatientHomeBlockItemsDialog";
import { PatientHomeBlockPreview } from "./PatientHomeBlockPreview";
import { PatientHomeBlockRuntimeStatusBadge } from "./PatientHomeBlockRuntimeStatusBadge";
import { PatientHomeCreateSectionInlineDialog } from "./PatientHomeCreateSectionInlineDialog";
import { PatientHomeRepairTargetsDialog } from "./PatientHomeRepairTargetsDialog";

type KnownRefs = {
  contentPages: string[];
  contentSections: string[];
  courses: string[];
};

export function PatientHomeBlockSettingsCard({
  block,
  knownRefs,
  runtimeStatus,
  onChanged,
}: {
  block: PatientHomeBlock;
  knownRefs: KnownRefs;
  runtimeStatus: PatientHomeBlockRuntimeStatus;
  onChanged(): void;
}) {
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManageItems = canManageItemsForBlock(block.code);
  const unresolved = useMemo(() => listUnresolvedPatientHomeBlockItems(block, knownRefs), [block, knownRefs]);
  const { visible: visibleUnresolved, hidden: hiddenUnresolved } = useMemo(
    () => partitionUnresolvedPatientHomeItemsByVisibility(unresolved),
    [unresolved],
  );
  const repairOnlyHiddenBroken =
    canManageItems && visibleUnresolved.length === 0 && hiddenUnresolved.length > 0;
  const canInlineCreateSection = getPatientHomeBlockEditorMetadata(block.code).inlineCreate.contentSection;

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
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold">{block.title}</div>
            <div className="text-xs text-muted-foreground">{block.code}</div>
          </div>
          <PatientHomeBlockRuntimeStatusBadge status={runtimeStatus} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-9 items-center justify-center rounded-md border border-transparent hover:bg-muted"
            aria-label="Действия блока"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleToggle} disabled={isPending}>
                {block.isVisible ? "Скрыть" : "Показать"}
              </DropdownMenuItem>
              {canManageItems && canInlineCreateSection ? (
                <DropdownMenuItem onClick={() => setCreateSectionOpen(true)}>Создать раздел и добавить</DropdownMenuItem>
              ) : null}
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
              {canManageItems && unresolved.length > 0 ? (
                <DropdownMenuItem onClick={() => setRepairOpen(true)}>
                  Исправить связи CMS…
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PatientHomeBlockPreview
        items={block.items}
        knownRefs={knownRefs}
        onRepairClick={canManageItems && visibleUnresolved.length > 0 ? () => setRepairOpen(true) : undefined}
      />
      {repairOnlyHiddenBroken ? (
        <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="mb-2">Есть битые связи CMS у скрытых элементов — на главной пациента они не показываются.</p>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRepairOpen(true)}>
            Исправить связи CMS…
          </Button>
        </div>
      ) : null}
      {error ? <div className="mt-2 text-sm text-destructive">{error}</div> : null}
      {addOpen ? (
        <PatientHomeAddItemDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          blockCode={block.code}
          onSaved={onChanged}
        />
      ) : null}
      {createSectionOpen ? (
        <PatientHomeCreateSectionInlineDialog
          open={createSectionOpen}
          onOpenChange={setCreateSectionOpen}
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
      {repairOpen && unresolved.length > 0 ? (
        <PatientHomeRepairTargetsDialog
          open={repairOpen}
          onOpenChange={setRepairOpen}
          blockCode={block.code}
          unresolvedItems={unresolved}
          onSaved={onChanged}
        />
      ) : null}
    </section>
  );
}
