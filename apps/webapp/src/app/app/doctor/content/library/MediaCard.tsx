"use client";

import Link from "next/link";
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canRenderInlineImage } from "./mediaPreview";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mimeType: string;
  filename: string;
  displayName?: string | null;
  size: number;
  userId?: string | null;
  uploadedByName?: string | null;
  createdAt: string;
  url: string;
};

type Props = {
  item: MediaItem;
  deleting: boolean;
  copied: boolean;
  resolutionText?: string | null;
  onDelete: () => void;
  onRename: () => void;
  onMoveFolder: () => void;
  onOpenPreview: () => void;
  onCopyUrl: () => void;
  formatSize: (bytes: number) => string;
  formatDate: (iso: string) => string;
};

function mediaTitle(item: MediaItem): string {
  return item.displayName?.trim() || item.filename;
}

export function MediaCard({
  item,
  deleting,
  copied,
  resolutionText,
  onDelete,
  onRename,
  onMoveFolder,
  onOpenPreview,
  onCopyUrl,
  formatSize,
  formatDate,
}: Props) {
  const renderInlineImage = item.kind === "image" && canRenderInlineImage(item.mimeType);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
          {renderInlineImage ? (
            <button
              type="button"
              className="block w-full p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onOpenPreview}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="max-h-40 w-full object-contain bg-muted/30" />
            </button>
          ) : item.kind === "video" ? (
            <div className="flex flex-col gap-2 p-1">
              <video className="h-40 w-full object-cover" controls preload="metadata">
                <source src={item.url} />
              </video>
              <Button type="button" variant="secondary" size="sm" className="mx-1 shrink-0" onClick={onOpenPreview}>
                Предпросмотр
              </Button>
            </div>
          ) : item.kind === "audio" ? (
            <div className="flex flex-col gap-2 p-3">
              <audio controls preload="metadata" className="w-full">
                <source src={item.url} />
              </audio>
              <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={onOpenPreview}>
                Предпросмотр
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-3">
              <p className="text-center text-sm text-muted-foreground">Файл</p>
              <a className="text-center text-primary underline" href={item.url} target="_blank" rel="noreferrer">
                Открыть в новой вкладке
              </a>
              <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={onOpenPreview}>
                Предпросмотр
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <p className="truncate text-sm font-medium" title={mediaTitle(item)}>
          {mediaTitle(item)}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.kind} • {formatSize(item.size)}
        </p>
        <p className="text-xs text-muted-foreground">Разрешение: {resolutionText ?? "—"}</p>
        <p className="text-xs text-muted-foreground">
          Загрузил:{" "}
          {item.userId ? (
            <Link className="text-primary underline" href={`/app/doctor/clients/${item.userId}`}>
              {item.uploadedByName?.trim() || item.userId}
            </Link>
          ) : (
            "неизвестно"
          )}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onCopyUrl();
          }}
        >
          {copied ? "URL скопирован" : "Скопировать URL"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-muted"
            aria-label="Действия"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRename}>Переименовать</DropdownMenuItem>
              <DropdownMenuItem onClick={onMoveFolder}>Папка…</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={deleting} onClick={onDelete}>
                {deleting ? "Удаление..." : "Удалить"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
