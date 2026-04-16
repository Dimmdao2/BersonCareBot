"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPickerList, type MediaListItem } from "@/shared/ui/media/MediaPickerList";
import {
  buildAdminMediaListUrl,
  filterMediaLibraryPickerItemsByQuery,
  useMediaLibraryPickerItems,
} from "@/shared/ui/media/useMediaLibraryPickerItems";

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
  /** После выбора из библиотеки. */
  onInsert: (url: string, filename: string) => void;
};

/**
 * Попап: выбор файла из медиабиблиотеки для вставки в Markdown.
 * Новые файлы загружаются на экране «Библиотека файлов» в CMS.
 */
export function MediaLibraryInsertDialog({ onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);

  const listUrl = useMemo(() => buildAdminMediaListUrl({ apiKind: "all" }), []);

  const { items, loading, error } = useMediaLibraryPickerItems({ open, listUrl });

  const displayedItems = useMemo(() => filterMediaLibraryPickerItemsByQuery(items, query), [items, query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function handlePicked(item: MediaListItem) {
    onInsert(item.url, item.filename);
    handleOpenChange(false);
  }

  const body = (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        Чтобы загрузить новые файлы, откройте{" "}
        <Link href="/app/doctor/content/library" className="font-medium text-primary underline underline-offset-2">
          библиотеку файлов
        </Link>
        , затем вернитесь и вставьте нужный файл отсюда.
      </p>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Библиотека</p>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Поиск по имени</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Введите часть имени файла"
          />
        </label>
        <MediaPickerList items={displayedItems} loading={loading} error={error} onSelect={handlePicked} />
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
          setOpen(true);
        }}
      >
        Вставить из библиотеки
      </Button>
      {isMobileViewport ? (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-auto">
            <SheetHeader>
              <SheetTitle>Библиотека файлов</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{body}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Библиотека файлов</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
