/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDoctorProactiveInsightsCount } from './useDoctorProactiveInsightsCount';

describe('useDoctorProactiveInsightsCount', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when tenant runtime is disabled', () => {
    const { result } = renderHook(() => useDoctorProactiveInsightsCount(false));

    expect(result.current).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
