"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { patientHomeBlockItemTargetTypeLabelRu } from "@/modules/patient-home/patientHomeBlockItemDisplayTitle";
import { canManageItemsForBlock, isPatientHomeBlockCode, type PatientHomeCmsBlockCode } from "@/modules/patient-home/blocks";
import {
  assertPatientHomeCmsBlockCode,
  buildPatientHomeContentNewUrl,
  buildPatientHomeCourseNewUrl,
  buildPatientHomeSectionsNewUrl,
  PATIENT_HOME_CMS_DEFAULT_RETURN_PATH,
} from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { addPatientHomeItem, listPatientHomeCandidates } from "./actions";

type Candidate = {
  targetType: string;
  targetRef: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
};

export function PatientHomeAddItemDialog({
  open,
  onOpenChange,
  blockCode,
  onSaved,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  blockCode: string;
  onSaved(): void;
}) {
  const [items, setItems] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const res = await listPatientHomeCandidates(blockCode);
      if (res.ok) {
        setItems(res.items);
        setError(null);
      } else {
        setItems([]);
        setError(res.error);
      }
    });
  }, [open, blockCode]);

  const cmsNavBlock: PatientHomeCmsBlockCode | null = useMemo(() => {
    if (!isPatientHomeBlockCode(blockCode)) return null;
    if (!canManageItemsForBlock(blockCode)) return null;
    return assertPatientHomeCmsBlockCode(blockCode) ? blockCode : null;
  }, [blockCode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q) || item.targetRef.toLowerCase().includes(q));
  }, [items, query]);

  const handleAdd = (item: Candidate) => {
    setError(null);
    startTransition(async () => {
      const res = await addPatientHomeItem({
        blockCode,
        targetType: item.targetType,
        targetRef: item.targetRef,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      onOpenChange(false);
    });
  };

  const returnTo = PATIENT_HOME_CMS_DEFAULT_RETURN_PATH;
  const showCmsCreateShortcuts =
    cmsNavBlock !== null && items.length === 0 && error === null && !isPending;
  const usefulPostMaterialOnly = blockCode === "useful_post";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      key={open ? `patient-home-add-item-${blockCode}` : "patient-home-add-item-closed"}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить материал</DialogTitle>
          <DialogDescription>Выберите элемент для блока.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Поиск по названию"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {items.length === 0 && error === null && isPending ? (
            <div className="text-sm text-muted-foreground">Загрузка списка…</div>
          ) : null}
          {items.length > 0
            ? filtered.map((item) => (
                <div key={`${item.targetType}:${item.targetRef}`} className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {patientHomeBlockItemTargetTypeLabelRu(item.targetType)} · {item.targetRef}
                  </div>
                  {item.subtitle ? <div className="mt-1 text-xs text-muted-foreground">{item.subtitle}</div> : null}
                  <div className="mt-2">
                    <Button size="sm" onClick={() => handleAdd(item)} disabled={isPending}>
                      Добавить
                    </Button>
                  </div>
                </div>
              ))
            : null}
          {items.length === 0 && !isPending && error === null ? (
            showCmsCreateShortcuts ? (
              <div
                className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3 text-sm"
                data-testid="patient-home-add-item-cms-shortcuts"
              >
                <p className="mb-2 text-muted-foreground">
                  {usefulPostMaterialOnly ?
                    "Нет материалов, которые можно выбрать для этого блока. Создайте страницу в каталоге статей или в системной папке CMS (не в разделах «Разминки» и SOS), затем вернитесь сюда."
                  : "Нет готовых элементов в списке. Создайте новый объект в CMS:"}
                </p>
                <ul className="flex flex-col gap-2">
                  {!usefulPostMaterialOnly ?
                    <li>
                      <Link
                        className="text-primary underline underline-offset-2"
                        href={buildPatientHomeSectionsNewUrl({ returnTo, patientHomeBlock: cmsNavBlock! })}
                      >
                        Создать раздел
                      </Link>
                    </li>
                  : null}
                  <li>
                    <Link
                      className="text-primary underline underline-offset-2"
                      href={buildPatientHomeContentNewUrl({ returnTo, patientHomeBlock: cmsNavBlock! })}
                    >
                      Создать материал
                    </Link>
                  </li>
                  {!usefulPostMaterialOnly ?
                    <li>
                      <Link
                        className="text-primary underline underline-offset-2"
                        href={buildPatientHomeCourseNewUrl({ returnTo, patientHomeBlock: cmsNavBlock! })}
                      >
                        Создать курс
                      </Link>
                    </li>
                  : null}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Ничего не найдено.</div>
            )
          ) : null}
          {items.length > 0 && filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">Ничего не найдено.</div>
          ) : null}
        </div>
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Закрыть</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
