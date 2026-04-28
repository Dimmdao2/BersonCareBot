"use client";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          {filtered.map((item) => (
            <div key={`${item.targetType}:${item.targetRef}`} className="rounded-lg border border-border p-3">
              <div className="text-sm font-medium">{item.title}</div>
              <div className="text-xs text-muted-foreground">{item.targetType}: {item.targetRef}</div>
              {item.subtitle ? <div className="mt-1 text-xs text-muted-foreground">{item.subtitle}</div> : null}
              <div className="mt-2">
                <Button size="sm" onClick={() => handleAdd(item)} disabled={isPending}>
                  Добавить
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? (
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
