import { describe, expect, it } from 'vitest';
import { createBookingFormService } from './service';
import type { BookingFormFieldRecord, BookingFormPort } from './ports';

describe('booking form surfaces', () => {
  it('keeps booking overrides out of the lead form and keeps lead email mandatory', async () => {
    const rows: BookingFormFieldRecord[] = [
      {
        id: 'booking-email',
        organizationId: 'org-a',
        formSurface: 'booking',
        fieldKey: 'email',
        fieldType: 'email',
        label: 'booking-email',
        placeholder: null,
        isRequired: false,
        sortOrder: 5,
        isActive: true,
        archivedAt: null,
      },
      {
        id: 'lead-email',
        organizationId: 'org-a',
        formSurface: 'leads',
        fieldKey: 'email',
        fieldType: 'email',
        label: 'lead-email',
        placeholder: null,
        isRequired: false,
        sortOrder: 5,
        isActive: false,
        archivedAt: null,
      },
    ];
    const port: BookingFormPort = {
      async listActiveFields(org, _audience, surface = 'booking') {
        return rows.filter((row) => row.organizationId === org && row.formSurface === surface);
      },
      async listAllFieldsAdmin(org, surface = 'booking') {
        return rows.filter((row) => row.organizationId === org && row.formSurface === surface);
      },
      async upsertFieldAdmin() {
        throw new Error('not used');
      },
      async archiveFieldAdmin() {},
      async saveSubmissions() {},
    };
    const service = createBookingFormService(port);
    const booking = await service.listAdminFields('org-a', 'booking');
    const leadFields = await service.listAdminFields('org-a', 'leads');
    expect(booking.find((field) => field.fieldKey === 'email')).toMatchObject({
      id: 'booking-email',
      isRequired: false,
    });
    expect(leadFields.find((field) => field.fieldKey === 'email')).toMatchObject({
      id: 'lead-email',
      isRequired: true,
      isActive: true,
    });
  });
});
