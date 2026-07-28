import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0227_booking_location_default_palette.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('booking location palette migration', () => {
  it('seeds the global canonical, runtime, and integrator mirror rows without rewriting branches', () => {
    expect(migration).toContain('INSERT INTO public.system_settings');
    expect(migration).toContain('INSERT INTO public.app_runtime_settings');
    expect(migration).toContain('INSERT INTO integrator.system_settings');
    expect(migration).toContain("'booking_location_default_palette'");
    expect(migration).toContain('organization_id IS NULL');
    expect(migration).not.toMatch(/UPDATE\s+(?:public\.)?be_branches/i);
  });
});
