"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { MediaPickerShell } from "@/shared/ui/doctor/media/MediaPickerShell";
import { MediaPickerPanel } from "@/shared/ui/doctor/media/MediaPickerPanel";
import type { MediaListItem } from "@/shared/ui/doctor/media/MediaPickerList";
import { MediaThumb } from "@/shared/ui/doctor/media/MediaThumb";
import { libraryMediaRowToPreviewUi } from "@/shared/ui/doctor/media/mediaPreviewUiModel";
import { fetchAdminMediaListItem } from "@/shared/ui/doctor/media/fetchAdminMediaListItem";
import type { MediaPreviewStatus } from "@/modules/media/types";

type PickedLogo = {
  mediaId: string;
  url: string;
  previewSmUrl: string | null;
  previewMdUrl: string | null;
  previewStatus: MediaPreviewStatus | null;
};

export type OrgBrandLogoChange = { mediaId: string; url: string } | null;

type Props = {
  /** Server-resolved published logo, or `null` when nothing is set (empty state). */
  initialMediaId: string | null;
  initialUrl: string | null;
  onChange: (next: OrgBrandLogoChange) => void;
  disabled?: boolean;
};

/**
 * UX-05 B2 — logo control for the clinic brand editing surface. Owner naming (2026-07-25,
 * BRANDING_DOMAIN_CONTRACT.md "Owner decisions on the brand editing UI"): the two actions are
 * «Установить» and «Очистить» — «Установить» also covers replacing an existing logo, there is no
 * separate replace action, and «Очистить» only unlinks the logo (the file stays in the library).
 *
 * Reuses the SAME picker/upload pipeline as the content library and exercise/recommendation media
 * pickers (`MediaPickerShell` + `MediaPickerPanel`, which itself calls `/api/media/upload`) — no
 * hand-rolled upload path. Only the two-button chrome here is new; `MediaLibraryPickerDialog`
 * (the shared component other forms use) is left untouched because its "Изменить" dropdown chrome
 * does not match the owner's exact two-action naming for this screen.
 */
export function OrgBrandLogoControl({ initialMediaId, initialUrl, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [logo, setLogo] = useState<PickedLogo | null>(
    initialMediaId && initialUrl
      ? { mediaId: initialMediaId, url: initialUrl, previewSmUrl: null, previewMdUrl: null, previewStatus: null }
      : null,
  );

  // Hydrate the server-given initial logo's preview fields once (same idiom as
  // ContentHeroImage/MediaLibraryPickerDialog): the management-state read only carries the media
  // id, not preview status, so the thumbnail would otherwise render a permanent pending skeleton.
  useEffect(() => {
    if (!initialMediaId || !initialUrl) return;
    let cancelled = false;
    void fetchAdminMediaListItem(initialMediaId).then((item) => {
      if (cancelled || !item) return;
      setLogo({
        mediaId: item.id,
        url: item.url,
        previewSmUrl: item.previewSmUrl ?? null,
        previewMdUrl: item.previewMdUrl ?? null,
        previewStatus: item.previewStatus ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePick = (item: MediaListItem) => {
    setLogo({
      mediaId: item.id,
      url: item.url,
      previewSmUrl: item.previewSmUrl ?? null,
      previewMdUrl: item.previewMdUrl ?? null,
      previewStatus: item.previewStatus ?? null,
    });
    onChange({ mediaId: item.id, url: item.url });
    setOpen(false);
  };

  const handleClear = () => {
    setLogo(null);
    onChange(null);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30">
        {logo ? (
          <MediaThumb
            media={libraryMediaRowToPreviewUi({
              id: logo.mediaId,
              kind: "image",
              url: logo.url,
              previewSmUrl: logo.previewSmUrl,
              previewMdUrl: logo.previewMdUrl,
              previewStatus: logo.previewStatus,
            })}
            className="h-16 w-16"
            imgClassName="h-16 w-16 object-contain"
            sizes="64px"
            labels={{ skipped: "Без превью", failed: "Ошибка превью" }}
          />
        ) : (
          <span className="px-1 text-center text-[10px] text-muted-foreground">Нет лого</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          Установить
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !logo} onClick={handleClear}>
          Очистить
        </Button>
      </div>

      <MediaPickerShell title="Логотип клиники" open={open} onOpenChange={setOpen}>
        <MediaPickerPanel
          key={open ? "org-brand-logo-open" : "org-brand-logo-closed"}
          open={open}
          apiKind="image"
          kind="image"
          folderId={undefined}
          onPick={handlePick}
          exercisePicker={false}
          onPickerFolderIdChange={() => {}}
          showSort={false}
          showFolderScope={false}
        />
      </MediaPickerShell>
    </div>
  );
}
