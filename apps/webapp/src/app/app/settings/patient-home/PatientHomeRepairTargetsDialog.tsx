"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PatientHomeBlockItem } from "@/modules/patient-home/ports";
import { suggestedSlugForNewContentSection } from "@/modules/patient-home/patientHomeUnresolvedRefs";
import { listPatientHomeCandidates, retargetPatientHomeItem } from "./actions";

type Candidate = {
  targetType: string;
  targetRef: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
};

export function PatientHomeRepairTargetsDialog({
  open,
  onOpenChange,
  blockCode,
  unresolvedItems,
  onSaved,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  blockCode: string;
  unresolvedItems: PatientHomeBlockItem[];
  onSaved(): void;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectionByItemId, setSelectionByItemId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setCandidatesLoading(true);
      const res = await listPatientHomeCandidates(blockCode);
      if (cancelled) return;
      if (res.ok) {
        setCandidates(res.items);
        setError(null);
      } else {
        setCandidates([]);
        setError(res.error);
      }
      setCandidatesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, blockCode]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const item of unresolvedItems) {
      const match = candidates.find((c) => c.targetType === item.targetType && c.targetRef === item.targetRef);
      next[item.id] = match ? `${match.targetType}:${match.targetRef}` : "";
    }
    queueMicrotask(() => {
      setSelectionByItemId(next);
    });
  }, [open, unresolvedItems, candidates]);

  const candidatesByType = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const arr = m.get(c.targetType) ?? [];
      arr.push(c);
      m.set(c.targetType, arr);
    }
    return m;
  }, [candidates]);

  const applyRetarget = (item: PatientHomeBlockItem) => {
    const key = selectionByItemId[item.id] ?? "";
    const [tt, ref] = key.split(":");
    if (!tt || !ref) {
      setError("Выберите цель из списка");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await retargetPatientHomeItem({ itemId: item.id, targetType: tt, targetRef: ref });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      if (unresolvedItems.length <= 1) {
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Исправить связи CMS</DialogTitle>
          <DialogDescription>
            Для каждого элемента выберите существующий материал, раздел или курс. Slug в CMS не меняется — обновляется
            только ссылка в блоке главной.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {unresolvedItems.map((item) => {
            const options = candidatesByType.get(item.targetType) ?? [];
            const selectValue = selectionByItemId[item.id] ?? "";
            const suggested = suggestedSlugForNewContentSection(item.targetRef);
            return (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="text-sm font-medium">
                  {item.titleOverride?.trim() || item.targetRef}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.targetType}: {item.targetRef} (не найдено в CMS)
                </div>
                <div className="mt-3 space-y-2">
                  <Select
                    value={selectValue}
                    onValueChange={(v) =>
                      setSelectionByItemId((prev) => ({ ...prev, [item.id]: typeof v === "string" ? v : "" }))
                    }
                    disabled={candidatesLoading || isPending || options.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={options.length === 0 ? "Нет доступных целей" : "Выберите цель"} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((c) => (
                        <SelectItem key={`${c.targetType}:${c.targetRef}`} value={`${c.targetType}:${c.targetRef}`}>
                          {c.title} ({c.targetRef})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => applyRetarget(item)}
                      disabled={candidatesLoading || isPending || !selectValue}
                    >
                      Применить
                    </Button>
                    {item.targetType === "content_section" ?
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={candidatesLoading || isPending}
                        onClick={() => {
                          const q = suggested ? `?suggestedSlug=${encodeURIComponent(suggested)}` : "";
                          router.push(`/app/doctor/content/sections/new${q}`);
                        }}
                      >
                        Создать раздел…
                      </Button>
                    : null}
                    {item.targetType === "content_page" ?
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={candidatesLoading || isPending}
                        onClick={() => router.push("/app/doctor/content/new")}
                      >
                        Новый материал…
                      </Button>
                    : null}
                    {item.targetType === "course" ?
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={candidatesLoading || isPending}
                        onClick={() => router.push("/app/doctor/treatment-program-templates")}
                      >
                        К каталогу курсов…
                      </Button>
                    : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Закрыть</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
