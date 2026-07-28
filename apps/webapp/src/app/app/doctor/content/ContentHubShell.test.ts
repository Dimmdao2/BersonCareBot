import { describe, expect, it } from 'vitest';
import { contentMobileBackTarget } from './contentMobileBack';

describe('content mobile back flow', () => {
  it('returns editor and inline page creation to materials before sections', () => {
    expect(contentMobileBackTarget({ editingPage: true, creatingPage: false })).toBe('materials');
    expect(contentMobileBackTarget({ editingPage: false, creatingPage: true })).toBe('materials');
  });

  it('returns materials and section creation to sections', () => {
    expect(contentMobileBackTarget({ editingPage: false, creatingPage: false })).toBe('sections');
  });
});
