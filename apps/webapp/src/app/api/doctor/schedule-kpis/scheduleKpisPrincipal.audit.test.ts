import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('doctor schedule KPI workspace principal', () => {
  it('uses the selected workspace and never falls back to a role-only session', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/api/doctor/schedule-kpis/route.ts'),
      'utf8',
    );

    expect(src).toContain('requireDoctorWorkspaceApiContext');
    expect(src).toContain('withDoctorWorkspacePrincipal');
    expect(src).toContain('organizationId: gate.ctx.organizationId');
    expect(src).not.toContain('getCurrentSession');
    expect(src).not.toContain('canAccessDoctor');
  });

  it('keeps the canonical KPI repository fail-closed without a default organization', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/infra/repos/pgDoctorCanonicalAppointments.ts'),
      'utf8',
    );
    const method = src.slice(
      src.indexOf('async getScheduleKpis('),
      src.indexOf('async getAppointmentDailySeries('),
    );

    expect(method).toContain('schedule_kpis_organization_required');
    expect(method).toContain('const organizationId = audience.organizationId');
    expect(method).not.toContain('getDefaultOrganizationId');
  });
});
