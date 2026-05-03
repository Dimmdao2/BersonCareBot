"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import { patchAdminSetting } from "./patchAdminSetting";

export type VideoHlsWatermarkSettingsSectionProps = {
  initialEnabled: boolean;
};

export function VideoHlsWatermarkSettingsSection({ initialEnabled }: VideoHlsWatermarkSettingsSectionProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setToggleError(null);
    startTransition(async () => {
      const ok = await patchAdminSetting("video_watermark_enabled", next);
      if (!ok) {
        setToggleError("Не удалось сохранить");
        return;
      }
      setEnabled(next);
    });
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">HLS: watermark при транскоде</CardTitle>
        <p className="text-xs text-muted-foreground">
          Опциональный burn-in текст в углу кадра для новых HLS-артефактов и постера. Текст — только идентификатор файла (UUID), без email и без user id. Работает вместе с{" "}
          <code className="rounded bg-muted px-1">video_hls_pipeline_enabled</code> на media-worker. На хосте воркера нужен TTF-шрифт (например DejaVu) или env{" "}
          <code className="rounded bg-muted px-1">MEDIA_WORKER_WATERMARK_FONT</code>.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <LabeledSwitch
          label="Включить watermark"
          hint="Транскод дольше и с большим лимитом таймаута ffmpeg; выключение не меняет уже готовые HLS."
          checked={enabled}
          onCheckedChange={toggle}
          disabled={isPending}
        />
        {toggleError ? <p className="text-xs text-destructive">{toggleError}</p> : null}
      </CardContent>
    </Card>
  );
}
