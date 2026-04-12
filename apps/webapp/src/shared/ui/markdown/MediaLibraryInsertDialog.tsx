"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPickerList, type MediaListItem } from "@/shared/ui/media/MediaPickerList";
import { MediaUploader } from "./MediaUploader";

function subscribeMobileViewport(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

type Props = {
  /** После выбора из библиотеки или успешной загрузки. */
  onInsert: (url: string, filename: string) => void;
};

/**
 * Попап: медиабиблиотека (все типы) + загрузка нового файла для вставки в Markdown.
 */
export function MediaLibraryInsertDialog({ onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MediaListItem[]>([]);
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", "all");
    p.set("sortBy", "date");
    p.set("sortDir", "desc");
    if (query.trim()) p.set("q", query.trim());
    p.set("limit", "80");
    return `/api/admin/media?${p.toString()}`;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(url, { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: MediaListItem[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "load_failed");
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить библиотеку");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  function handlePicked(item: MediaListItem) {
    onInsert(item.url, item.filename);
    setOpen(false);
  }

  function handleUploaded(uploadUrl: string, filename: string) {
    onInsert(uploadUrl, filename);
    setOpen(false);
  }

  const body = (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Новый файл</p>
        <MediaUploader onUploaded={handleUploaded} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Библиотека</p>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Поиск по имени</span>
          <Input
            value={query}
            onChange={(e) => {
              setLoading(true);
              setError(null);
              setQuery(e.target.value);
            }}
            placeholder="Введите часть имени файла"
          />
        </label>
        <MediaPickerList items={items} loading={loading} error={error} onSelect={handlePicked} />
      </div>
    </div>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setQuery("");
          setError(null);
          setLoading(true);
          setOpen(true);
        }}
      >
        Вставить файл
      </Button>
      {isMobileViewport ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-auto">
            <SheetHeader>
              <SheetTitle>Файл из библиотеки или загрузка</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{body}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Файл из библиотеки или загрузка</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
