import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNativeHlsPlayback } from './nativeHls';

function NativeHlsProbe() {
  const nativeHls = useNativeHlsPlayback();
  return <div data-testid="native-hls">{nativeHls ? 'native' : 'fallback'}</div>;
}

describe('useNativeHlsPlayback', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('hydrates Safari native-HLS capability without changing the initial server tree', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    const container = document.createElement('div');
    container.innerHTML = renderToString(<NativeHlsProbe />);
    expect(container.querySelector('[data-testid="native-hls"]')?.textContent).toBe('fallback');
    document.body.appendChild(container);
    const hydrationErrors: unknown[] = [];

    await act(async () => {
      root = hydrateRoot(container, <NativeHlsProbe />, {
        onRecoverableError: (error) => hydrationErrors.push(error),
      });
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="native-hls"]')?.textContent).toBe('native');
    });
    expect(hydrationErrors).toEqual([]);
  });
});
