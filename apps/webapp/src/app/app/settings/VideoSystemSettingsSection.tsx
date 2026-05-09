"use client";

import { useCallback, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import {
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from "@/modules/media/videoPresignTtlConstants";
import { videoDeliveryStrategySelectItems } from "@/shared/ui/selectOpaqueValueLabels";
import { patchAdminSetting } from "./patchAdminSetting";

export type VideoDefaultDeliveryUi = "mp4" | "hls" | "auto";

export type VideoSystemSettingsSectionProps = {
  initialPlaybackApiEnabled: boolean;
  initialDefaultDelivery: VideoDefaultDeliveryUi;
  initialHlsPipelineEnabled: boolean;
  initialNewUploadsAutoTranscode: boolean;
  initialWatermarkEnabled: boolean;
  initialPresignTtlSeconds: number;
};

export function VideoSystemSettingsSection({
  initialPlaybackApiEnabled,
  initialDefaultDelivery,
  initialHlsPipelineEnabled,
  initialNewUploadsAutoTranscode,
  initialWatermarkEnabled,
  initialPresignTtlSeconds,
}: VideoSystemSettingsSectionProps) {
  const [playbackApi, setPlaybackApi] = useState(initialPlaybackApiEnabled);
  const [defaultDelivery, setDefaultDelivery] = useState<VideoDefaultDeliveryUi>(initialDefaultDelivery);
  const [pipeline, setPipeline] = useState(initialHlsPipelineEnabled);
  const [autoTranscode, setAutoTranscode] = useState(initialNewUploadsAutoTranscode);
  const [watermark, setWatermark] = useState(initialWatermarkEnabled);
  const [ttl, setTtl] = useState(String(initialPresignTtlSeconds));
  const [ttlSaved, setTtlSaved] = useState(false);
  const [ttlError, setTtlError] = useState<string | null>(null);

  const [patchError, setPatchError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [ttlPending, startTtlTransition] = useTransition();

  const runPatch = useCallback(async (key: string, value: unknown, apply: () => void) => {
    setPatchError(null);
    setBusyKey(key);
    const ok = await patchAdminSetting(key, value);
    setBusyKey(null);
    if (!ok) {
      setPatchError("Не удалось сохранить");
      return;
    }
    apply();
  }, []);

  function handleTtlSave() {
    setTtlSaved(false);
    setTtlError(null);
    startTtlTransition(async () => {
      const raw = ttl.trim();
      if (!/^\d+$/.test(raw)) {
        setTtlError("Укажите целое число секунд");
        return;
      }
      const n = Number.parseInt(raw, 10);
      if (n < VIDEO_PRESIGN_TTL_MIN_SEC || n > VIDEO_PRESIGN_TTL_MAX_SEC) {
        setTtlError(`Допустимый диапазон: ${VIDEO_PRESIGN_TTL_MIN_SEC}…${VIDEO_PRESIGN_TTL_MAX_SEC} с`);
        return;
      }
      const ok = await patchAdminSetting("video_presign_ttl_seconds", n);
      if (!ok) {
        setTtlError("Не удалось сохранить");
        return;
      }
      setTtlSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Воспроизведение видео</CardTitle>
          <p className="text-xs text-muted-foreground">
            JSON для пациентского плеера; без включённого API экраны, которые запрашивают только{" "}
            <code className="rounded bg-muted px-1">/playback</code>, не получат параметры.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LabeledSwitch
            label="Включить playback API"
            hint="GET /api/media/…/playback и presigned HLS/MP4 в одном ответе."
            checked={playbackApi}
            onCheckedChange={(next) =>
              void runPatch("video_playback_api_enabled", next, () => setPlaybackApi(next))
            }
            disabled={busyKey === "video_playback_api_enabled"}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="video-default-delivery" className="text-xs font-medium">
              Стратегия выдачи по умолчанию
            </label>
            <Select
              value={defaultDelivery}
              onValueChange={(v) => {
                if (v !== "mp4" && v !== "hls" && v !== "auto") return;
                void runPatch("video_default_delivery", v, () => setDefaultDelivery(v));
              }}
              disabled={busyKey === "video_default_delivery"}
            >
              <SelectTrigger
                id="video-default-delivery"
                className="max-w-md"
                displayLabel={videoDeliveryStrategySelectItems[defaultDelivery]}
              />
              <SelectContent>
                <SelectItem value="mp4">{videoDeliveryStrategySelectItems.mp4}</SelectItem>
                <SelectItem value="hls">{videoDeliveryStrategySelectItems.hls}</SelectItem>
                <SelectItem value="auto">{videoDeliveryStrategySelectItems.auto}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Если HLS ещё не готов, сервер отдаёт MP4 (fallback).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Транскод HLS</CardTitle>
          {!pipeline ? (
            <p className="text-xs text-muted-foreground">
              Пока пайплайн выключен, очередь транскода не обрабатывается; новые HLS не появятся без включения и
              работающего media-worker на сервере.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Очередь <code className="rounded bg-muted px-1">media_transcode_jobs</code>, процесс{" "}
              <code className="rounded bg-muted px-1">apps/media-worker</code> (на хосте обычно unit{" "}
              <code className="rounded bg-muted px-1">bersoncarebot-media-worker-prod.service</code> — см. документацию
              деплоя).
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LabeledSwitch
            label="Включить пайплайн HLS"
            hint="Мастер-выключатель очереди и обработки воркером."
            checked={pipeline}
            onCheckedChange={(next) =>
              void runPatch("video_hls_pipeline_enabled", next, () => setPipeline(next))
            }
            disabled={busyKey === "video_hls_pipeline_enabled"}
          />
          <LabeledSwitch
            label="Автотранскод новых загрузок"
            hint="После успешной загрузки video/* ставить задачу в очередь (нужны включённый пайплайн и воркер)."
            checked={autoTranscode}
            onCheckedChange={(next) =>
              void runPatch("video_hls_new_uploads_auto_transcode", next, () => setAutoTranscode(next))
            }
            disabled={busyKey === "video_hls_new_uploads_auto_transcode"}
          />
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium">Watermark при транскоде</p>
            <LabeledSwitch
              label="Включить watermark"
              hint="Burn-in UUID в кадре; дольше ffmpeg. Уже готовые HLS не меняются."
              checked={watermark}
              onCheckedChange={(next) =>
                void runPatch("video_watermark_enabled", next, () => setWatermark(next))
              }
              disabled={busyKey === "video_watermark_enabled"}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              На воркере нужен TTF (например DejaVu) или env{" "}
              <code className="rounded bg-muted px-1">MEDIA_WORKER_WATERMARK_FONT</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Приватное видео (S3)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Срок жизни подписанных ссылок для playback и редиректа на MP4; доступ только по сессии.
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
              disabled={ttlPending}
              autoComplete="off"
              className="max-w-xs"
            />
            <span className="text-xs text-muted-foreground">
              Диапазон {VIDEO_PRESIGN_TTL_MIN_SEC}…{VIDEO_PRESIGN_TTL_MAX_SEC} с.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleTtlSave} disabled={ttlPending}>
              {ttlPending ? "Сохранение…" : "Сохранить TTL"}
            </Button>
            {ttlSaved ? <span className="text-sm text-green-600">Сохранено</span> : null}
            {ttlError ? <span className="text-sm text-destructive">{ttlError}</span> : null}
          </div>
        </CardContent>
      </Card>

      {patchError ? <p className="text-sm text-destructive">{patchError}</p> : null}
    </div>
  );
}
