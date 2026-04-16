"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MediaExerciseUsageEntry, MediaFolderRecord } from "@/modules/media/types";
import { cn } from "@/lib/utils";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { libraryMediaRowToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import {
  buildAdminMediaListUrl,
  filterMediaLibraryPickerItemsByQuery,
  narrowMediaLibraryPickerItemsByKind,
  useMediaLibraryPickerItems,
  type AdminMediaListUrlSortBy,
} from "@/shared/ui/media/useMediaLibraryPickerItems";

type AutoCreateListSortPreset = "date:desc" | "date:asc" | "name:asc" | "name:desc";

function parseAutoCreateListSortPreset(preset: AutoCreateListSortPreset): {
  sortBy: AdminMediaListUrlSortBy;
  sortDir: "asc" | "desc";
} {
  const [a, b] = preset.split(":") as ["date" | "name", "asc" | "desc"];
  return { sortBy: a, sortDir: b };
}
import { bulkCreateExercisesFromMedia } from "./actions";
import { EXERCISES_PATH } from "./exercisesPaths";
import { exerciseMediaTypeFromPick, exerciseTitleFromLibraryItem } from "./exerciseMediaFromLibrary";

function folderPathLabel(folder: MediaFolderRecord, all: MediaFolderRecord[]): string {
  const byId = new Map(all.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur: MediaFolderRecord | undefined = folder;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(" / ");
}

function exerciseUsageTooltipLines(usage: MediaExerciseUsageEntry[]): string {
  const max = 25;
  const slice = usage.slice(0, max);
  const lines = slice.map((u) => u.title.trim()).filter(Boolean);
  if (usage.length > max) lines.push(`… и ещё ${usage.length - max}`);
  return lines.join("\n");
}

function MediaCard({
  item,
  selected,
  exerciseUsage,
  onToggle,
}: {
  item: MediaListItem;
  selected: boolean;
  exerciseUsage?: MediaExerciseUsageEntry[];
  onToggle: () => void;
}) {
  const title = item.displayName?.trim() || item.filename;
  const hasExerciseUsage = Boolean(exerciseUsage?.length);
  const usageTooltip = hasExerciseUsage ? exerciseUsageTooltipLines(exerciseUsage!) : "";

  const thumbMedia = libraryMediaRowToPreviewUi(item);

  return (
    <div className="relative flex flex-col gap-2 rounded-md border border-border p-3">
      {hasExerciseUsage ? (
        <Tooltip>
          <TooltipTrigger
            type="button"
            className="absolute top-2 right-2 z-10 flex size-5 cursor-default items-center justify-center rounded-full border border-green-600/30 bg-background shadow-sm"
            aria-label={`Уже в упражнениях: ${usageTooltip.replaceAll("\n", ", ")}`}
          >
            <Check className="size-3 text-green-600" aria-hidden strokeWidth={3} />
          </TooltipTrigger>
          <TooltipContent side="left" align="end" className="max-w-xs whitespace-pre-line text-left">
            {usageTooltip}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <div className="relative min-h-20 overflow-hidden rounded border border-border/60 bg-muted/30">
        <MediaThumb
          media={thumbMedia}
          className="h-24 w-full"
          imgClassName="h-24 w-full object-contain bg-muted/30"
          labels={{ skipped: "Без превью", failed: "Нет превью" }}
        />
      </div>
      <p className="min-h-10 break-words line-clamp-2 text-sm font-medium" title={title}>
        {title}
      </p>
      <p className="text-xs text-muted-foreground">video</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          selected &&
            "border-green-600 bg-green-600 text-white hover:bg-green-700 hover:text-white hover:border-green-700",
        )}
        onClick={onToggle}
      >
        {selected ? "Снять выбор" : "Выбрать"}
      </Button>
    </div>
  );
}

export function AutoCreateExercisesClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    created: number;
    skippedLinked: number;
    failed: number;
  } | null>(null);

  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<MediaFolderRecord[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [newOnly, setNewOnly] = useState(true);
  const [pickerFolderId, setPickerFolderId] = useState<string | null | undefined>(undefined);
  const [exerciseUsageByMediaId, setExerciseUsageByMediaId] = useState<
    Record<string, MediaExerciseUsageEntry[]>
  >({});
  const [usageReady, setUsageReady] = useState(false);
  const [selectedById, setSelectedById] = useState<Map<string, MediaListItem>>(new Map());
  const [listSortPreset, setListSortPreset] = useState<AutoCreateListSortPreset>("date:desc");

  const { sortBy: listSortBy, sortDir: listSortDir } = useMemo(
    () => parseAutoCreateListSortPreset(listSortPreset),
    [listSortPreset],
  );

  const listUrl = useMemo(
    () =>
      buildAdminMediaListUrl({
        apiKind: "video",
        folderId: pickerFolderId,
        sortBy: listSortBy,
        sortDir: listSortDir,
      }),
    [pickerFolderId, listSortBy, listSortDir],
  );

  const { items, loading, error } = useMediaLibraryPickerItems({ open: true, listUrl });

  useEffect(() => {
    const ac = new AbortController();
    queueMicrotask(() => setFoldersLoaded(false));
    fetch("/api/admin/media/folders?flat=true", { credentials: "same-origin", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: MediaFolderRecord[] };
        if (!res.ok || !data.ok) throw new Error("folders_failed");
        return data.items ?? [];
      })
      .then((list) => {
        if (ac.signal.aborted) return;
        setFolders(list);
        setFoldersLoaded(true);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setFolders([]);
        setFoldersLoaded(true);
      });
    return () => ac.abort();
  }, []);

  const usageRequestRef = useRef(0);

  useEffect(() => {
    const ids = [...new Set(items.map((i) => i.id).filter(Boolean))];
    if (ids.length === 0) {
      queueMicrotask(() => {
        setExerciseUsageByMediaId({});
        setUsageReady(true);
      });
      return;
    }
    const requestId = ++usageRequestRef.current;
    const ac = new AbortController();
    queueMicrotask(() => setUsageReady(false));

    const runUsageFetch = () => {
      if (ac.signal.aborted || requestId !== usageRequestRef.current) return;
      fetch("/api/admin/media/exercise-usage", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        signal: ac.signal,
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            ok?: boolean;
            usage?: Record<string, MediaExerciseUsageEntry[]>;
            error?: string;
          };
          if (!res.ok || !data.ok) throw new Error(data.error ?? "usage_failed");
          return data.usage ?? {};
        })
        .then((raw) => {
          if (ac.signal.aborted || requestId !== usageRequestRef.current) return;
          const normalized: Record<string, MediaExerciseUsageEntry[]> = {};
          for (const [k, v] of Object.entries(raw)) {
            normalized[k.toLowerCase()] = Array.isArray(v) ? v : [];
          }
          setExerciseUsageByMediaId(normalized);
          setUsageReady(true);
        })
        .catch(() => {
          if (ac.signal.aborted || requestId !== usageRequestRef.current) return;
          setExerciseUsageByMediaId({});
          setUsageReady(true);
        });
    };

    let idleCallbackId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(runUsageFetch, { timeout: 400 });
    } else {
      timeoutId = setTimeout(runUsageFetch, 0);
    }

    return () => {
      ac.abort();
      if (idleCallbackId !== undefined && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [items]);

  const sortedFolders = useMemo(() => {
    if (folders.length === 0) return [];
    return folders.slice().sort((a, b) => {
      const pa = folderPathLabel(a, folders);
      const pb = folderPathLabel(b, folders);
      return pa.localeCompare(pb, "ru");
    });
  }, [folders]);

  const folderSelectValue =
    pickerFolderId === undefined ? "__all__" : pickerFolderId === null ? "__root__" : pickerFolderId;

  const folderSelectDisplayLabel = useMemo(() => {
    if (pickerFolderId === undefined) return "Все папки";
    if (pickerFolderId === null) return "Корень";
    const f = folders.find((x) => x.id === pickerFolderId);
    if (f) return folderPathLabel(f, folders);
    return foldersLoaded ? pickerFolderId : "Загрузка…";
  }, [pickerFolderId, folders, foldersLoaded]);

  const kindFiltered = useMemo(() => narrowMediaLibraryPickerItemsByKind(items, "video"), [items]);
  const queryFiltered = useMemo(
    () => filterMediaLibraryPickerItemsByQuery(kindFiltered, query),
    [kindFiltered, query],
  );

  const displayedItems = useMemo(() => {
    if (!newOnly || !usageReady) return queryFiltered;
    return queryFiltered.filter((item) => {
      const u = exerciseUsageByMediaId[item.id.toLowerCase()];
      return !u?.length;
    });
  }, [newOnly, queryFiltered, usageReady, exerciseUsageByMediaId]);

  const selectedList = useMemo(() => {
    return [...selectedById.values()].sort((a, b) => {
      const ta = exerciseTitleFromLibraryItem(a);
      const tb = exerciseTitleFromLibraryItem(b);
      return ta.localeCompare(tb, "ru");
    });
  }, [selectedById]);

  const toggleItem = (item: MediaListItem) => {
    setSelectedById((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedById((prev) => {
      const next = new Map(prev);
      for (const item of displayedItems) {
        next.set(item.id, item);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedById(new Map());
  };

  const handleCreate = () => {
    setSubmitError(null);
    setLastResult(null);
    const payload = selectedList.map((item) => ({
      title: exerciseTitleFromLibraryItem(item),
      mediaUrl: item.url,
      mediaType: exerciseMediaTypeFromPick({
        kind: item.kind,
        mimeType: item.mimeType,
        filename: item.filename,
        displayName: item.displayName,
      }),
    }));

    startTransition(async () => {
      const result = await bulkCreateExercisesFromMedia(payload);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      setLastResult({
        created: result.created,
        skippedLinked: result.skippedLinked,
        failed: result.failed,
      });
      if (result.created > 0) {
        router.push(EXERCISES_PATH);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={EXERCISES_PATH} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          ← К упражнениям
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-3">
          <h2 className="mb-3 text-sm font-semibold">Медиа</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={selectAllVisible}>
              Выбрать все
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
              Снять выбор
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Поиск по имени</span>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Введите часть имени файла"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">Папка</span>
                <Select
                  value={folderSelectValue}
                  onValueChange={(v) => {
                    if (v === "__all__") setPickerFolderId(undefined);
                    else if (v === "__root__") setPickerFolderId(null);
                    else setPickerFolderId(v);
                  }}
                  disabled={!foldersLoaded}
                >
                  <SelectTrigger size="sm" className="h-8 w-full max-w-full min-w-0 text-left">
                    <SelectValue placeholder="Папка">{folderSelectDisplayLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Все папки</SelectItem>
                    <SelectItem value="__root__">Корень</SelectItem>
                    {sortedFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {folderPathLabel(f, folders)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">Порядок списка</span>
                <Select value={listSortPreset} onValueChange={(v) => setListSortPreset(v as AutoCreateListSortPreset)}>
                  <SelectTrigger size="sm" className="h-8 w-full text-left">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date:desc">Сначала новые</SelectItem>
                    <SelectItem value="date:asc">Сначала старые</SelectItem>
                    <SelectItem value="name:asc">Название А→Я</SelectItem>
                    <SelectItem value="name:desc">Название Я→А</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1 sm:items-end">
                <span className="text-xs text-muted-foreground">Фильтр</span>
                <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-muted/20 px-1.5 text-[11px]">
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1.5 py-0.5 transition-colors",
                      !newOnly ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setNewOnly(false)}
                  >
                    все
                  </button>
                  <span className="text-muted-foreground/60">|</span>
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1.5 py-0.5 transition-colors",
                      newOnly ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setNewOnly(true)}
                  >
                    только новые
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {loading ? <p className="text-sm text-muted-foreground">Загрузка...</p> : null}
            {!loading && !error && displayedItems.length === 0 ? (
              <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Нет видео</p>
            ) : null}
            {!loading && !error && displayedItems.length > 0 ? (
              <div className="grid max-h-[65vh] grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
                {displayedItems.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    selected={selectedById.has(item.id)}
                    exerciseUsage={exerciseUsageByMediaId[item.id.toLowerCase()]}
                    onToggle={() => toggleItem(item)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
          <h2 className="text-sm font-semibold">Выбранные</h2>
          <p className="text-xs text-muted-foreground">Файлов: {selectedList.length}</p>
          {submitError ? (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
          {lastResult && lastResult.created === 0 ? (
            <p className="text-sm text-muted-foreground">
              Создано: {lastResult.created}, пропущено (уже в упражнениях): {lastResult.skippedLinked}, ошибок:{" "}
              {lastResult.failed}
            </p>
          ) : null}
          <ul className="max-h-[50vh] flex-1 list-inside list-disc overflow-auto text-sm">
            {selectedList.length === 0 ? (
              <li className="list-none text-muted-foreground">Ничего не выбрано</li>
            ) : (
              selectedList.map((item) => (
                <li key={item.id} className="break-words">
                  {exerciseTitleFromLibraryItem(item)}
                </li>
              ))
            )}
          </ul>
          <Button
            type="button"
            disabled={pending || selectedList.length === 0}
            className="w-full sm:w-auto"
            onClick={handleCreate}
          >
            {pending ? "Создание…" : `Создать упражнения (${selectedList.length})`}
          </Button>
        </section>
      </div>
    </div>
  );
}
