"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { PatientHomeBlockCode } from "@/modules/patient-home/blocks";
import { patientHomeBlockRequiresItemList } from "@/modules/patient-home/blocks";
import { getPatientHomeBlockDisplayTitle } from "@/modules/patient-home/blockEditorMetadata";
import type { PatientHomeEditorCandidateRow, PatientHomeEditorItemRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { PatientHomeBlockPreview } from "@/app/app/settings/patient-home/PatientHomeBlockPreview";
import { PatientHomeBlockRuntimeStatus } from "@/app/app/settings/patient-home/PatientHomeBlockRuntimeStatus";
import { PatientHomeBlockEditorItems } from "@/app/app/settings/patient-home/PatientHomeBlockEditorItems";
import { PatientHomeBlockCandidatePicker } from "@/app/app/settings/patient-home/PatientHomeBlockCandidatePicker";
import { setPatientHomeBlockVisibilityAction } from "@/app/app/settings/patient-home/actions";

export type PatientHomeBlockEditorDialogProps = {
  blockCode: PatientHomeBlockCode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialBlockVisible: boolean;
  initialItems?: PatientHomeEditorItemRow[];
  initialCandidates?: PatientHomeEditorCandidateRow[];
};

export function PatientHomeBlockEditorDialog({
  blockCode,
  open,
  onOpenChange,
  initialBlockVisible,
  initialItems,
  initialCandidates,
}: PatientHomeBlockEditorDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [blockVisible, setBlockVisible] = useState(initialBlockVisible);
  const [items, setItems] = useState<PatientHomeEditorItemRow[]>(initialItems ?? []);
  const [candidates, setCandidates] = useState<PatientHomeEditorCandidateRow[]>(initialCandidates ?? []);
  const [search, setSearch] = useState("");

  const handleOpenChange = (v: boolean) => {
    if (!v && dirty) {
      router.refresh();
    }
    onOpenChange(v);
  };

  const title = getPatientHomeBlockDisplayTitle(blockCode);
  const needsItems = patientHomeBlockRequiresItemList(blockCode);

  const visibleResolvedCount = useMemo(
    () => items.filter((i) => i.isVisible && i.resolved).length,
    [items],
  );

  const unresolvedRefs = useMemo(
    () =>
      items
        .filter((i) => !i.resolved)
        .map((i) => ({ kind: "missing_target" as const, targetKey: `${i.targetType}:${i.targetRef}` })),
    [items],
  );

  const onVisibilityChange = (v: boolean) => {
    setBlockVisible(v);
    setDirty(true);
    startTransition(async () => {
      await setPatientHomeBlockVisibilityAction(blockCode, v);
    });
  };

  const onPickCandidate = (c: PatientHomeEditorCandidateRow) => {
    const row: PatientHomeEditorItemRow = {
      id: `picked-${c.id}-${Math.random().toString(36).slice(2, 8)}`,
      targetType: c.targetType,
      targetRef: c.targetRef,
      title: c.title,
      isVisible: true,
      resolved: true,
    };
    setItems((prev) => [...prev, row]);
    setCandidates((prev) => prev.filter((x) => x.id !== c.id));
    setDirty(true);
  };

  const onItemsChange = (next: PatientHomeEditorItemRow[]) => {
    setDirty(true);
    setItems(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3">
          <DialogTitle>Настроить: {title}</DialogTitle>
          <DialogDescription className="text-xs">
            Единый редактор блока: статус, превью для пациента, элементы и кандидаты. Превью не кликабельно; правки в CMS — по ссылкам «Открыть в CMS».
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 max-h-[min(52vh,420px)] flex-1">
          <div className="space-y-4 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor={`ph-block-visible-${blockCode}`} className="text-sm font-medium">
                  Блок на главной пациента
                </Label>
                <p className="text-xs text-muted-foreground">Видимость всего блока (не отдельных элементов).</p>
              </div>
              <Switch
                id={`ph-block-visible-${blockCode}`}
                checked={blockVisible}
                disabled={pending}
                onCheckedChange={(v) => onVisibilityChange(Boolean(v))}
              />
            </div>

            <PatientHomeBlockRuntimeStatus blockCode={blockCode} blockVisible={blockVisible} items={items} />

            <section aria-labelledby={`ph-preview-${blockCode}`}>
              <h3 id={`ph-preview-${blockCode}`} className="mb-2 text-sm font-semibold">
                Что увидит пациент
              </h3>
              <PatientHomeBlockPreview
                blockCode={blockCode}
                isBlockVisible={blockVisible}
                visibleItemsCount={visibleResolvedCount}
                unresolvedRefs={unresolvedRefs}
              />
            </section>

            {needsItems ? (
              <>
                <Separator />
                <section aria-labelledby={`ph-items-${blockCode}`}>
                  <h3 id={`ph-items-${blockCode}`} className="mb-2 text-sm font-semibold">
                    Элементы блока
                  </h3>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Перетаскивание, видимость элемента, удаление из блока и исправление битых целей. Данные пока демо;
                    сохранение в БД подключится без смены UX.
                  </p>
                  <PatientHomeBlockEditorItems blockCode={blockCode} items={items} onItemsChange={onItemsChange} />
                </section>
                <Separator />
                <section aria-labelledby={`ph-add-${blockCode}`}>
                  <h3 id={`ph-add-${blockCode}`} className="mb-2 text-sm font-semibold">
                    Добавить
                  </h3>
                  <PatientHomeBlockCandidatePicker
                    blockCode={blockCode}
                    candidates={candidates}
                    search={search}
                    onSearchChange={setSearch}
                    onPick={onPickCandidate}
                    onInlineSectionCreated={(item) => {
                      setItems((prev) => [...prev, item]);
                      setDirty(true);
                    }}
                  />
                </section>
              </>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3">
          <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
