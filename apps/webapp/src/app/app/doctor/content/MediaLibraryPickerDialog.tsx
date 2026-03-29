"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MediaKind = "image" | "video";

type MediaListItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
};

type Props = {
  kind: MediaKind;
  value: string;
  onChange: (nextUrl: string) => void;
};

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

export function MediaLibraryPickerDialog({ kind, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MediaListItem[]>([]);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", kind);
    p.set("sortBy", "date");
    p.set("sortDir", "desc");
    if (query.trim()) p.set("q", query.trim());
    p.set("limit", "80");
    return `/api/admin/media?${p.toString()}`;
  }, [kind, query]);

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

  const isApiMedia = value.startsWith("/api/media/");

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

      {open ? (
        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex items-end gap-2">
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
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Закрыть
            </Button>
          </div>

          {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
          {loading ? <p className="text-sm text-muted-foreground">Загрузка...</p> : null}

          {!loading ? (
            <div className="max-h-80 overflow-auto rounded border border-border">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-2 py-1">Имя</th>
                    <th className="px-2 py-1">Тип</th>
                    <th className="px-2 py-1">Дата</th>
                    <th className="px-2 py-1">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-2 py-1">{item.filename}</td>
                      <td className="px-2 py-1">{item.kind}</td>
                      <td className="px-2 py-1">{shortDate(item.createdAt)}</td>
                      <td className="px-2 py-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            onChange(item.url);
                            setOpen(false);
                          }}
                        >
                          Выбрать
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                        Нет файлов
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
