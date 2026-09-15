'use client';

import { useEffect, useState } from 'react';
import { fetchAdminMediaListItem } from './fetchAdminMediaListItem';
import { libraryMediaRowToPreviewUi, type MediaPreviewUiModel } from './mediaPreviewUiModel';

/**
 * Состояние картинки по её идентификатору — для форм, которые хранят ТОЛЬКО `mediaId`.
 *
 * Зачем отдельный хук. Такая форма не знает ни адреса миниатюры, ни готовности превью, и до сих пор
 * каждое место выкручивалось само: рисовало `<img src="/api/media/{id}">` и получало сломанную
 * картинку, пока наш рендишн не готов. Сырой исходник наружу не отдаётся никогда (HEIC с айфона —
 * ровно этот случай), поэтому «пока не готово» — это НОРМАЛЬНОЕ состояние, у которого должен быть
 * вид, а не битый значок. Владелец 15.09.2026: «по логотипам всё чинить», единым механизмом.
 *
 * Хук доопрашивает дверь, пока превью считается: иначе человек, только что загрузивший файл, видел
 * бы «готовится» до перезагрузки страницы. Опрос ограничен по числу попыток — это подсказка глазу,
 * а не очередь; не дождались за две минуты, значит случай не про мгновенное ожидание.
 */
const POLL_INTERVAL_MS = 5_000;
const POLL_ATTEMPTS = 24;

/** `pending`/`processing` — файл ещё в очереди превью; `blocked`/`failed`/`skipped` опросом не лечатся. */
function stillWorking(model: MediaPreviewUiModel): boolean {
  return model.previewStatus === 'pending' || model.previewStatus === 'processing';
}

/**
 * Пачка идентификаторов за один проход — предпросмотр визитки держит логотип, фотографии и аватары
 * специалистов сразу, и каждому из них нужен один и тот же ответ двери.
 */
export function useMediaPreviewUiMap(
  mediaIds: readonly (string | null | undefined)[],
): Record<string, MediaPreviewUiModel> {
  const key = mediaIds
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(',');
  const [models, setModels] = useState<Record<string, MediaPreviewUiModel>>({});
  const ids = [...new Set(key.split(',').filter(Boolean))];

  useEffect(() => {
    const ids = [...new Set(key.split(',').filter(Boolean))];
    if (ids.length === 0) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      void Promise.all(ids.map((id) => fetchAdminMediaListItem(id))).then((items) => {
        if (cancelled) return;
        const next: Record<string, MediaPreviewUiModel> = {};
        for (const item of items) {
          if (!item) continue;
          next[item.id] = {
            ...libraryMediaRowToPreviewUi({
              id: item.id,
              kind: item.kind,
              url: item.url,
              previewSmUrl: item.previewSmUrl,
              previewMdUrl: item.previewMdUrl,
              previewStatus: item.previewStatus,
              sourceWidth: item.sourceWidth,
              sourceHeight: item.sourceHeight,
            }),
            standardRendition: item.standardRendition ?? null,
          };
        }
        setModels(next);
        attempts += 1;
        if (attempts < POLL_ATTEMPTS && Object.values(next).some(stillWorking)) {
          timer = setTimeout(load, POLL_INTERVAL_MS);
        }
      });
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key]);

  /**
   * Наружу отдаётся только то, что спрашивали СЕЙЧАС: набор идентификаторов у вызывающего меняется
   * (закрыли предпросмотр, убрали фотографию), и ответ на прошлый набор не должен пережить его.
   */
  const current: Record<string, MediaPreviewUiModel> = {};
  for (const id of ids) {
    const model = models[id];
    if (model) current[id] = model;
  }
  return current;
}

/** Один идентификатор — та же дверь и тот же опрос, что у пачки. */
export function useMediaPreviewUi(mediaId: string | null | undefined): MediaPreviewUiModel | null {
  const models = useMediaPreviewUiMap([mediaId]);
  const id = mediaId?.trim();
  return (id ? models[id] : null) ?? null;
}
