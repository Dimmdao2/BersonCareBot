import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeRuntimeContext } from '@/shared/ui/PlatformProvider';
import type { NativeRuntimeSnapshot } from '@/shared/lib/platform';
import {
  ProgramItemSubmissionSourceDialog,
  type ProgramItemSubmissionSourceDialogHandle,
} from './ProgramItemSubmissionSourceDialog';

/**
 * #915 M5-01/M5-04 kill-set item 5/6: «success/abort/cancel releases the native handle exactly
 * once» and «session/selection replacement … cannot leak a handle».
 *
 * Названная поломка: пациент внутри нативной оболочки записывает слишком короткое видео, продукт
 * штатно отказывает («video_too_short») — и НЕ зовёт `DeviceMedia.release`. Плагин к этому моменту
 * уже скопировал ролик в приватный кэш приложения (`apps/mobile-shell/README.md`:
 * «Unknown/non-seekable sources are copied once to private cache»), поэтому каждая такая попытка
 * навсегда оставляет на устройстве полную копию видео. Отказ ДОРОГОЙ (память телефона пациента,
 * растёт неограниченно) и МОЛЧАЛИВЫЙ (никакой ошибки, отказ выглядит штатным) — §10a ступень 2.
 * Конструкцией (ступень 1) он здесь не выражается: владение handle пересекает границу компонента.
 *
 * Oracle — принятый контракт плагина (`apps/mobile-shell/README.md`, строка `DeviceMedia`) и
 * MASTER_PLAN M5-04. Проверяется наблюдаемый side effect на внешней границе (§10b), не число
 * внутренних вызовов, не тексты и не разметка.
 */

const NATIVE_RUNTIME: NativeRuntimeSnapshot = {
  kind: 'therapygo_android',
  version: '1.0.0',
  capabilities: { jitsi: true, media: true, push: true },
};

const instanceId = '22222222-2222-4222-8222-222222222222';
const itemId = '44444444-4444-4444-8444-444444444444';

function installDeviceMedia(capture: () => Promise<unknown>) {
  const releaseCalls: string[] = [];
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      DeviceMedia: {
        captureMedia: capture,
        pickMedia: capture,
        pickDocument: capture,
        upload: async () => ({ outcome: 'uploaded', status: 200, etag: 'e' }),
        cancelUpload: async () => undefined,
        release: async ({ handle }: { handle: string }) => {
          releaseCalls.push(handle);
        },
      },
    },
  };
  return releaseCalls;
}

function renderDialog(onError: (message: string) => void) {
  const ref = createRef<ProgramItemSubmissionSourceDialogHandle>();
  render(
    <NativeRuntimeContext.Provider value={NATIVE_RUNTIME}>
      <ProgramItemSubmissionSourceDialog
        ref={ref}
        instanceId={instanceId}
        itemId={itemId}
        onError={onError}
      />
    </NativeRuntimeContext.Provider>,
  );
  return ref;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.restoreAllMocks();
});

describe('ProgramItemSubmissionSourceDialog — native selection lifecycle', () => {
  it('releases the native handle when the selected video is rejected before begin (too short)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const releaseCalls = installDeviceMedia(async () => ({
      outcome: 'selected',
      handle: 'opaque-too-short',
      mimeType: 'video/mp4',
      displayName: 'short.mp4',
      sizeBytes: 1024,
      durationSeconds: 3,
      source: 'camera',
      kind: 'video',
    }));
    const onError = vi.fn();
    const ref = renderDialog(onError);

    ref.current!.open();
    fireEvent.click(await screen.findByRole('button', { name: 'Записать' }));

    // The product correctly refuses BEFORE any begin call…
    await waitFor(() => expect(onError).toHaveBeenCalledWith('video_too_short'));
    expect(fetchSpy).not.toHaveBeenCalled();
    // …but the handle it was given is a terminal outcome and must be released exactly once.
    await waitFor(() => expect(releaseCalls).toEqual(['opaque-too-short']));

    vi.unstubAllGlobals();
  });

  it('releases the native handle when a video arrives without a usable duration', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const releaseCalls = installDeviceMedia(async () => ({
      outcome: 'selected',
      handle: 'opaque-no-duration',
      mimeType: 'video/mp4',
      displayName: 'clip.mp4',
      sizeBytes: 2048,
      source: 'gallery',
      kind: 'video',
    }));
    const onError = vi.fn();
    const ref = renderDialog(onError);

    ref.current!.open();
    fireEvent.click(await screen.findByRole('button', { name: 'Галерея' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('video_metadata_unavailable'));
    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(releaseCalls).toEqual(['opaque-no-duration']));

    vi.unstubAllGlobals();
  });
});
