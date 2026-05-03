"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from "@/modules/media/videoPresignTtlConstants";
import { patchAdminSetting } from "./patchAdminSetting";

export type VideoPrivateMediaSettingsSectionProps = {
  initialTtlSeconds: number;
};

export function VideoPrivateMediaSettingsSection({ initialTtlSeconds }: VideoPrivateMediaSettingsSectionProps) {
  const [ttl, setTtl] = useState(String(initialTtlSeconds));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const raw = ttl.trim();
      if (!/^\d+$/.test(raw)) {
        setError("Укажите целое число секунд");
        return;
      }
      const n = Number.parseInt(raw, 10);
      if (n < VIDEO_PRESIGN_TTL_MIN_SEC || n > VIDEO_PRESIGN_TTL_MAX_SEC) {
        setError(`Допустимый диапазон: ${VIDEO_PRESIGN_TTL_MIN_SEC}…${VIDEO_PRESIGN_TTL_MAX_SEC} с`);
        return;
      }
      const ok = await patchAdminSetting("video_presign_ttl_seconds", n);
      if (!ok) {
        setError("Не удалось сохранить");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Приватное видео (S3)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Срок жизни подписанных ссылок для{" "}
          <code className="rounded bg-muted px-1">GET /api/media/…/playback</code> и редиректа на MP4. Доступ по-прежнему
          только при сессии; без публичных долгоживущих URL.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">TTL presigned URL (секунды)</span>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            className="max-w-xs"
          />
          <span className="text-xs text-muted-foreground">
            Рекомендуется не ниже типичной сессии просмотра; максимум {VIDEO_PRESIGN_TTL_MAX_SEC} с (7 суток). Клиент
            обновляет playback при ошибках и до истечения срока.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved ? <span className="text-sm text-green-600">Сохранено</span> : null}
          {error ? <span className="text-sm text-destructive">{error}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
