"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaPickerPanel } from "@/shared/ui/media/MediaPickerPanel";
import { MediaPickerShell } from "@/shared/ui/media/MediaPickerShell";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";

export type MediaLibraryInsertPickMeta = Pick<MediaListItem, "kind" | "mimeType">;

type Props = {
  /** После выбора из библиотеки или загрузки с устройства. */
  onInsert: (url: string, filename: string, meta?: MediaLibraryInsertPickMeta) => void;
};

/**
 * Попап: выбор файла из медиабиблиотеки или загрузка с устройства для вставки в Markdown.
 */
export function MediaLibraryInsertDialog({ onInsert }: Props) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  const handlePicked = useCallback(
    (item: MediaListItem) => {
      onInsert(item.url, item.filename, { kind: item.kind, mimeType: item.mimeType });
      setOpen(false);
    },
    [onInsert],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Библиотека или загрузка
      </Button>
      <MediaPickerShell open={open} onOpenChange={handleOpenChange} title="Библиотека файлов">
        <MediaPickerPanel
          key={open ? "insert-open" : "insert-closed"}
          open={open}
          apiKind="all"
          folderId={undefined}
          kind="all"
          onPick={handlePicked}
          exercisePicker={false}
          pickerFolderId={undefined}
          onPickerFolderIdChange={() => {}}
          showSort={false}
        />
      </MediaPickerShell>
    </>
  );
}
