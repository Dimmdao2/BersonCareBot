"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { SystemParentCode } from "@/modules/content-sections/types";
import { attachArticleSectionToSystemFolder } from "./sections/actions";

const FOLDER_LABELS: Record<SystemParentCode, string> = {
  situations: "Ситуации",
  sos: "SOS",
  warmups: "Разминки",
  lessons: "Уроки",
};

/** Разделы каталога статей (`kind=article`), доступные для переноса в системную папку. */
export function AttachExistingSectionsModal({
  folderCode,
  freeSections,
}: {
  folderCode: SystemParentCode;
  freeSections: readonly { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachingSlug, setAttachingSlug] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function attach(slug: string) {
    setError(null);
    setAttachingSlug(slug);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("section_slug", slug);
      fd.set("system_parent_code", folderCode);
      const res = await attachArticleSectionToSystemFolder(null, fd);
      setAttachingSlug(null);
      if (!res.ok) {
        setError(res.error ?? "Не удалось перенести раздел");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const busy = attachingSlug !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="default" />}>
        Добавить из существующих
      </DialogTrigger>
      <DialogContent className="max-h-[min(85vh,560px)] gap-3 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-left">
            Добавить раздел в «{FOLDER_LABELS[folderCode]}»
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Разделы из каталога статей (ещё не привязаны к системной папке). После добавления раздел уходит из блока «Статьи» в
          сайдбаре.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {freeSections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет свободных разделов для переноса.</p>
        ) : (
          <ul className="flex max-h-[min(60vh,420px)] flex-col gap-1 overflow-y-auto pr-1">
            {freeSections.map((s) => (
              <li
                key={s.slug}
                className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-2 shadow-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{s.slug}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  disabled={busy}
                  aria-label={`Добавить «${s.title}» в папку`}
                  onClick={() => attach(s.slug)}
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
