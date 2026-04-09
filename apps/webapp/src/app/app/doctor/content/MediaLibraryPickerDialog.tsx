"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPickerList, type MediaListItem } from "./MediaPickerList";

type MediaKind = "image" | "video";

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
  kind: MediaKind;
  value: string;
  onChange: (nextUrl: string) => void;
  /** Library folder filter: `null` = root only; `undefined` = all files. */
  folderId?: string | null;
};

export function MediaLibraryPickerDialog({ kind, value, onChange, folderId }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MediaListItem[]>([]);
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", kind);
    p.set("sortBy", "date");
    p.set("sortDir", "desc");
    if (query.trim()) p.set("q", query.trim());
    p.set("limit", "80");
    if (folderId !== undefined) {
      if (folderId === null) p.set("folderId", "root");
      else p.set("folderId", folderId);
    }
    return `/api/admin/media?${p.toString()}`;
  }, [kind, query, folderId]);

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

  const isApiMedia =
    value.startsWith("/api/media/") || /^https?:\/\//i.test(value.trim());

  const pickerBody = (
    <div className="flex flex-col gap-3">
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
      <MediaPickerList
        items={items}
        loading={loading}
        error={error}
        onSelect={(item) => {
          onChange(item.url);
          setOpen(false);
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLoading(true);
            setError(null);
            setOpen(true);
          }}
        >
          Выбрать из библиотеки
        </Button>
        <Button type="button" variant="ghost" onClick={() => onChange("")}>
          Очистить
        </Button>
      </div>

      {value ? (
        <div className="text-sm">
          <p className="text-muted-foreground">
            Текущее значение:{" "}
            <span className="font-mono">{value}</span>
          </p>
          {!isApiMedia ? (
            <p className="text-xs text-amber-700">
              Legacy URL: для нового значения используйте выбор из библиотеки.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Файл не выбран</p>
      )}

      {isMobileViewport ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-auto">
            <SheetHeader>
              <SheetTitle>Библиотека файлов</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{pickerBody}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Библиотека файлов</DialogTitle>
            </DialogHeader>
            {pickerBody}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
