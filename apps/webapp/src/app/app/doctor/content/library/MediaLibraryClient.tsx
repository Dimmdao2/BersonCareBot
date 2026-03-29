"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MediaKindFilter = "all" | "image" | "video" | "audio" | "file";
type SortBy = "date" | "size" | "type";
type SortDir = "asc" | "desc";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mimeType: string;
  filename: string;
  size: number;
  createdAt: string;
  url: string;
};

type UsageRef = {
  pageId: string;
  pageSlug: string;
  field: "image_url" | "video_url" | "body_md" | "body_html";
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

function usageMessage(usage: UsageRef[]): string {
  const lines = usage.slice(0, 8).map((u) => `- ${u.pageSlug} (${u.field})`);
  const extra = usage.length > 8 ? `\n...и еще ${usage.length - 8}` : "";
  return `Файл используется в CMS:\n${lines.join("\n")}${extra}\n\nУдалить все равно?`;
}

export function MediaLibraryClient() {
  const [kind, setKind] = useState<MediaKindFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", kind);
    p.set("sortBy", sortBy);
    p.set("sortDir", sortDir);
    if (query.trim()) p.set("q", query.trim());
    return p.toString();
  }, [kind, sortBy, sortDir, query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/media?${searchParams}`, { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: MediaItem[]; error?: string };
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
  }, [searchParams, reloadKey]);

  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "upload_failed");
      setReloadKey((x) => x + 1);
    } catch {
      setError("Не удалось загрузить файл");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(item: MediaItem) {
    setDeletingId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media/${item.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 409) {
        const data = (await res.json()) as { usage?: UsageRef[] };
        const usage = data.usage ?? [];
        const confirmDelete = window.confirm(usageMessage(usage));
        if (!confirmDelete) return;
        const resForce = await fetch(`/api/admin/media/${item.id}?confirmUsed=true`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!resForce.ok) throw new Error("delete_failed");
      } else if (!res.ok) {
        throw new Error("delete_failed");
      }
      setReloadKey((x) => x + 1);
    } catch {
      setError("Не удалось удалить файл");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[9rem] flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Тип</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MediaKindFilter)}
            className="h-10 rounded-md border border-input bg-background px-2"
          >
            <option value="all">Все</option>
            <option value="image">Изображения</option>
            <option value="video">Видео</option>
            <option value="audio">Аудио</option>
            <option value="file">Файлы</option>
          </select>
        </label>

        <label className="flex min-w-[9rem] flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Сортировать по</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="h-10 rounded-md border border-input bg-background px-2"
          >
            <option value="date">Дате загрузки</option>
            <option value="size">Размеру</option>
            <option value="type">Типу</option>
          </select>
        </label>

        <label className="flex min-w-[8rem] flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Порядок</span>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
            className="h-10 rounded-md border border-input bg-background px-2"
          >
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </label>

        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Поиск по имени</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например, welcome-video"
          />
        </label>

        <label className="inline-flex h-10 items-center">
          <input type="file" className="sr-only" onChange={onUploadFile} disabled={uploading} />
          <span className="cursor-pointer rounded-md border border-input px-3 py-2 text-sm">
            {uploading ? "Загрузка..." : "Загрузить файл"}
          </span>
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Загрузка...</p> : null}

      {!loading && (
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Файл</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Размер</th>
                <th className="px-3 py-2">Дата загрузки</th>
                <th className="px-3 py-2">Просмотр</th>
                <th className="px-3 py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">{item.filename}</td>
                  <td className="px-3 py-2">{item.kind}</td>
                  <td className="px-3 py-2">{formatSize(item.size)}</td>
                  <td className="px-3 py-2">{formatDate(item.createdAt)}</td>
                  <td className="px-3 py-2">
                    {item.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt="" className="max-h-16 max-w-28 rounded border border-border object-cover" />
                    ) : item.kind === "video" ? (
                      <video className="max-h-16 max-w-28 rounded border border-border" controls preload="metadata">
                        <source src={item.url} />
                      </video>
                    ) : item.kind === "audio" ? (
                      <audio controls preload="metadata" className="h-8">
                        <source src={item.url} />
                      </audio>
                    ) : (
                      <a className="text-primary underline" href={item.url} target="_blank" rel="noreferrer">
                        Открыть
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deletingId === item.id}
                      onClick={() => onDelete(item)}
                    >
                      {deletingId === item.id ? "Удаление..." : "Удалить"}
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Файлы не найдены
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
