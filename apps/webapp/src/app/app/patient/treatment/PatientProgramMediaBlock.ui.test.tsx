import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecommendationMediaItem } from '@/modules/recommendations/types';
import { PatientProgramMediaBlock } from './PatientProgramMediaBlock';

vi.mock('@/shared/ui/patient/media/PatientMediaPlaybackVideo', () => ({
  PatientMediaPlaybackVideo: (props: { presentation?: 'inline' | 'fullscreen' }) => (
    <div data-testid={`patient-video-${props.presentation ?? 'inline'}`}>Плеер</div>
  ),
}));

const video: RecommendationMediaItem = {
  mediaType: 'video',
  mediaUrl: '/api/media/00000000-0000-4000-8000-000000000099',
  previewStatus: 'ready',
  previewSmUrl: '/api/media/00000000-0000-4000-8000-000000000099/preview/sm',
  previewMdUrl: '/api/media/00000000-0000-4000-8000-000000000099/preview/md',
  sortOrder: 0,
};

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(max-width: 767px), (max-height: 599px)',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery(true)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PatientProgramMediaBlock', () => {
  it('на mobile открывает видео в полноэкранной модалке и закрывает обратно в тот же экран', async () => {
    render(<PatientProgramMediaBlock media={video} title="Разминка" />);

    const trigger = screen.getByRole('button', { name: 'Открыть видео на весь экран' });
    expect(screen.queryByTestId('patient-video-fullscreen')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByTestId('patient-video-fullscreen')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('patient-video-fullscreen')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('на desktop сразу показывает inline-плеер на отдельном экране пункта', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery(false)));

    render(<PatientProgramMediaBlock media={video} title="Разминка" />);

    expect(screen.getByTestId('patient-video-inline')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Открыть видео на весь экран' }),
    ).not.toBeInTheDocument();
  });
});
