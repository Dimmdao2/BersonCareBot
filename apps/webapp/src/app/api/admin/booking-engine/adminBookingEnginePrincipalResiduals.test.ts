import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

const routeExpectations: Array<{ file: string; sources: string[] }> = [
  {
    file: 'scheduling-settings/route.ts',
    sources: ['admin.booking-engine.scheduling-settings.buffer-minutes'],
  },
  {
    file: 'availability/route.ts',
    sources: [
      'admin.booking-engine.availability.service-location.upsert',
      'admin.booking-engine.availability.specialist-service.upsert',
    ],
  },
  {
    file: 'policies/route.ts',
    sources: [
      'admin.booking-engine.policies.cancellation.upsert',
      'admin.booking-engine.policies.reschedule.upsert',
    ],
  },
  {
    file: 'prepayment-policies/route.ts',
    sources: ['admin.booking-engine.prepayment-policies.upsert'],
  },
  {
    file: 'branches/route.ts',
    sources: ['admin.booking-engine.branches.upsert'],
  },
  {
    file: 'branches/[id]/route.ts',
    sources: ['admin.booking-engine.branches.update', 'admin.booking-engine.branches.deactivate'],
  },
  {
    file: 'services/route.ts',
    sources: ['admin.booking-engine.services.upsert'],
  },
  {
    file: 'services/[id]/route.ts',
    sources: ['admin.booking-engine.services.update', 'admin.booking-engine.services.deactivate'],
  },
  {
    file: 'rooms/route.ts',
    sources: ['admin.booking-engine.rooms.upsert'],
  },
  {
    file: 'rooms/[id]/route.ts',
    sources: ['admin.booking-engine.rooms.update', 'admin.booking-engine.rooms.deactivate'],
  },
  {
    file: 'specialists/route.ts',
    sources: ['admin.booking-engine.specialists.upsert'],
  },
  {
    file: 'specialists/[id]/route.ts',
    sources: [
      'admin.booking-engine.specialists.update',
      'admin.booking-engine.specialists.deactivate',
    ],
  },
  {
    file: 'specialist-rooms/route.ts',
    sources: ['admin.booking-engine.specialist-rooms.set'],
  },
  {
    file: 'patient-packages/route.ts',
    sources: [
      'admin.booking-engine.patient-packages.manual-create',
      'admin.booking-engine.patient-packages.catalog-offer',
    ],
  },
  {
    file: 'patient-packages/[id]/route.ts',
    sources: ['admin.booking-engine.patient-packages.notes.update'],
  },
  {
    file: 'patient-packages/[id]/consume/route.ts',
    sources: ['admin.booking-engine.patient-packages.consume'],
  },
  {
    file: 'products/[id]/pay-link/route.ts',
    sources: ['admin.booking-engine.products.pay-link.create'],
  },
  {
    file: 'patient-products/[id]/consume/route.ts',
    sources: ['admin.booking-engine.patient-products.consume'],
  },
];

describe('admin booking-engine residual principal coverage', () => {
  it.each(routeExpectations)(
    '$file wraps admin booking mutations with the doctor workspace principal',
    ({ file, sources }) => {
      const src = readFileSync(join(__dirname, file), 'utf8');

      expect(src).toContain('withDoctorWorkspacePrincipal');
      for (const source of sources) {
        expect(src).toContain(source);
      }
    },
  );
});
