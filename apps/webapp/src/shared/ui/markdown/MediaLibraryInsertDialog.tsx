"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPickerList, type MediaListItem } from "@/shared/ui/media/MediaPickerList";
import { MEDIA_LIBRARY_SEARCH_DEBOUNCE_MS } from "@/shared/ui/media/mediaLibrarySearchDebounceMs";

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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MediaListItem[]>([]);
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);
  const openWasFalseRef = useRef(true);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", "all");
    p.set("sortBy", "date");
    p.set("sortDir", "desc");
    if (debouncedQuery.trim()) p.set("q", debouncedQuery.trim());
    p.set("limit", "80");
    return `/api/admin/media?${p.toString()}`;
  }, [debouncedQuery]);

  useEffect(() => {
    if (!open) {
      openWasFalseRef.current = true;
      return;
    }
    if (openWasFalseRef.current) {
      openWasFalseRef.current = false;
      queueMicrotask(() => setDebouncedQuery(query.trim()));
      return;
    }
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), MEDIA_LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetch(url, { credentials: "same-origin", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: MediaListItem[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "load_failed");
        if (!ac.signal.aborted) setItems(data.items ?? []);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
        if (name === "AbortError") return;
        setError("Не удалось загрузить библиотеку");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [open, url]);

  function handlePicked(item: MediaListItem) {
    onInsert(item.url, item.filename);
    setOpen(false);
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
            onChange={(e) => {
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
          setDebouncedQuery("");
          setError(null);
          setLoading(true);
          setOpen(true);
        }}
      >
        Вставить из библиотеки
      </Button>
      {isMobileViewport ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-auto">
            <SheetHeader>
              <SheetTitle>Библиотека файлов</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{body}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
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
