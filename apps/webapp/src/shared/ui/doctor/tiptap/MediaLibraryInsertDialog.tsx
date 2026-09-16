'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/shared/ui/doctor/tiptap/primitives/button';
import { ImagePlusIcon } from '@/shared/ui/doctor/tiptap/icons/image-plus-icon';
import { MediaPickerPanel } from '@/shared/ui/doctor/media/MediaPickerPanel';
import { MediaPickerShell } from '@/shared/ui/doctor/media/MediaPickerShell';
import type { MediaListItem } from '@/shared/ui/doctor/media/MediaPickerList';

export type MediaLibraryInsertPickMeta = Pick<MediaListItem, 'kind' | 'mimeType'>;

type Props = {
  onInsert: (url: string, filename: string, meta?: MediaLibraryInsertPickMeta) => void;
  disabled?: boolean;
};

export function MediaLibraryInsertDialog({ onInsert, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [folderScope, setFolderScope] = useState<string | null | undefined>(undefined);

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
        variant="ghost"
        disabled={disabled}
        tooltip="Добавить из библиотеки или загрузить"
        aria-label="Добавить из библиотеки или загрузить"
        onClick={() => setOpen(true)}
      >
        <ImagePlusIcon className="tiptap-button-icon" />
        <span className="tiptap-button-text">Добавить</span>
      </Button>
      <MediaPickerShell open={open} onOpenChange={setOpen} title="Библиотека файлов">
        <MediaPickerPanel
          key={open ? 'insert-open' : 'insert-closed'}
          open={open}
          apiKind="all"
          folderId={folderScope}
          kind="all"
          onPick={handlePicked}
          exercisePicker={false}
          onPickerFolderIdChange={setFolderScope}
          showSort
        />
      </MediaPickerShell>
    </>
  );
}
