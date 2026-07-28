import { describe, expect, it } from 'vitest';
import { doctorShellLinkPrefetch } from './doctorShellLinkPrefetch';

describe('doctorShellLinkPrefetch', () => {
  it('keeps default Next prefetch on ordinary tenant doctor pages', () => {
    expect(doctorShellLinkPrefetch(true)).toBeUndefined();
    expect(doctorShellLinkPrefetch()).toBeUndefined();
  });

  it('suppresses prefetch on the tenant-runtime-free Global System Health page', () => {
    expect(doctorShellLinkPrefetch(false)).toBe(false);
  });
});
