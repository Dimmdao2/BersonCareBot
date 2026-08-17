// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ width, height, children }: { width: number; height: number; children: ReactNode }) => (
    <div data-testid="recharts" data-width={width} data-height={height}>{children}</div>
  ),
}));

import { PositiveSizeResponsiveContainer } from './PositiveSizeResponsiveContainer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PositiveSizeResponsiveContainer', () => {
  it('does not mount Recharts for a hidden/zero-size host', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
    } as DOMRect);
    render(<PositiveSizeResponsiveContainer><span>chart</span></PositiveSizeResponsiveContainer>);
    expect(screen.queryByTestId('recharts')).toBeNull();
  });

  it('mounts with numeric positive dimensions for a visible host', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 640,
      height: 320,
    } as DOMRect);
    render(<PositiveSizeResponsiveContainer><span>chart</span></PositiveSizeResponsiveContainer>);
    await waitFor(() => expect(screen.getByTestId('recharts')).toBeTruthy());
    expect(screen.getByTestId('recharts').getAttribute('data-width')).toBe('640');
    expect(screen.getByTestId('recharts').getAttribute('data-height')).toBe('320');
  });
});
