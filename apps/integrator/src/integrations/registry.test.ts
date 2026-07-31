import { describe, expect, it } from 'vitest';
import { integrationRegistry } from './registry.js';

describe('integrationRegistry', () => {
  it('does not accept the removed instagram placeholder channel', () => {
    expect(integrationRegistry.some((integration) => integration.id === 'instagram')).toBe(false);
  });
});
