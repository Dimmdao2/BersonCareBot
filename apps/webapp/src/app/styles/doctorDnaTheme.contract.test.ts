import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const doctorCss = readFileSync(new URL('./doctor.css', import.meta.url), 'utf8');
const themeCss = readFileSync(new URL('./bersoncare-tweakcn-theme.css', import.meta.url), 'utf8');

describe('doctor Design DNA canvas contract', () => {
  it('uses the exact DNA canvas for the doctor workspace and semantic background', () => {
    expect(doctorCss).toContain('--doctor-page-gap-background: var(--bc-canvas, #f6f4ef);');
    expect(themeCss).toContain('--bc-canvas: #f6f4ef;');
    expect(themeCss).toContain('background: var(--doctor-page-gap-background, var(--bc-canvas));');
    expect(themeCss).toContain(
      '--background: var(--doctor-page-gap-background, var(--bc-canvas));',
    );
    expect(themeCss).not.toContain('var(--doctor-page-gap-background, #faf9f4)');
  });
});
