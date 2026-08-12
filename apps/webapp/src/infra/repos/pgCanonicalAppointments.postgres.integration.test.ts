import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { createPgCanonicalAppointmentAccessPort } from '@/infra/repos/pgCanonicalAppointments';

describe('canonical appointment access port (disposable Postgres)', () => {
  const organizationId = randomUUID();
  const appointmentId = randomUUID();
  const legacyExternalId = `legacy-${randomUUID()}`;
  const port = createPgCanonicalAppointmentAccessPort();

  beforeAll(async () => {
    const pool = getPool();
    const database = await pool.query<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);
    await pool.query(
      `ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE public.be_organizations DISABLE TRIGGER USER;
       ALTER TABLE public.be_appointments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE public.be_external_entity_mappings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE public.patient_bookings DISABLE ROW LEVEL SECURITY;`,
    );
    await pool.query(
      `INSERT INTO public.be_organizations (id, title) VALUES ($1, 'canonical appointment port')`,
      [organizationId],
    );
    await pool.query(
      `INSERT INTO public.be_appointments (
         id, organization_id, start_at, end_at, duration_minutes, source, status,
         phone_normalized, attribution_json
       ) VALUES ($1, $2, '2027-01-02T10:00:00Z', '2027-01-02T10:30:00Z', 30,
                 'imported', 'confirmed', '+79990000000', '{"source":"proof"}')`,
      [appointmentId, organizationId],
    );
    await pool.query(
      `INSERT INTO public.be_external_entity_mappings (
         organization_id, entity_type, canonical_id, external_system, external_id
       ) VALUES ($1, 'appointment', $2, 'rubitime', $3)`,
      [organizationId, appointmentId, legacyExternalId],
    );
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('resolves both canonical and retained Rubitime external identifiers through the real port', async () => {
    const canonical = await port.getByExternalRecordId(`be:${appointmentId}`);
    const legacy = await port.getByExternalRecordId(legacyExternalId);

    expect(canonical?.id).toBe(appointmentId);
    expect(legacy?.id).toBe(appointmentId);
    expect(legacy?.payloadJson).toEqual({ source: 'proof' });
  });

  it('soft-deletes the canonical appointment when called with a retained Rubitime identifier', async () => {
    await expect(
      port.softDeleteByExternalRecordId(legacyExternalId, { organizationId }),
    ).resolves.toBe(true);
    await expect(port.isExternalRecordPurged(legacyExternalId)).resolves.toBe(true);
  });
});
