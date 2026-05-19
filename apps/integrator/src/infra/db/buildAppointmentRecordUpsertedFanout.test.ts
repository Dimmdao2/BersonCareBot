/* eslint-disable no-secrets/no-secrets -- test titles reference exported symbol names */
import { describe, expect, it } from 'vitest';
import { APPOINTMENT_RECORD_UPSERTED } from '../../kernel/contracts/index.js';
import { buildAppointmentRecordUpsertedFanout } from './buildAppointmentRecordUpsertedFanout.js';

describe('buildAppointmentRecordUpsertedFanout', () => {
  it('maps booking.upsert fields to appointment.record.upserted payload', () => {
    const fanout = buildAppointmentRecordUpsertedFanout({
      externalRecordId: 'rec-1',
      phoneNormalized: '+79991234567',
      recordAt: '2025-06-01T10:00:00.000Z',
      status: 'created',
      payloadJson: { name: 'Иван Иванов', email: 'ivan@example.com', link: 'https://r/1' },
      lastEvent: 'created',
      updatedAt: '2025-06-01T09:00:00.000Z',
      patientFirstName: 'Иван',
      patientLastName: 'Иванов',
      patientEmail: null,
      integratorBranchId: 'br-1',
      branchName: 'Клиника',
      dateTimeEnd: '2025-06-01T11:00:00.000Z',
      serviceId: '10',
      serviceName: 'Приём',
      rubitimeCooperatorId: 'coop-1',
      integratorUserId: '100',
    });

    expect(fanout.eventType).toBe(APPOINTMENT_RECORD_UPSERTED);
    expect(fanout.payload).toMatchObject({
      integratorRecordId: 'rec-1',
      phoneNormalized: '+79991234567',
      patientEmail: 'ivan@example.com',
      patientFirstName: 'Иван',
      integratorBranchId: 'br-1',
      rubitimeManageUrl: 'https://r/1',
    });
    expect(fanout.idempotencyKey.length).toBeGreaterThan(10);
  });

  it('prefers explicit patientEmail over payloadJson.email', () => {
    const fanout = buildAppointmentRecordUpsertedFanout({
      externalRecordId: 'rec-2',
      phoneNormalized: '+79990001122',
      recordAt: null,
      status: 'updated',
      payloadJson: { email: 'from-payload@example.com' },
      lastEvent: 'updated',
      updatedAt: '2025-06-02T09:00:00.000Z',
      patientFirstName: null,
      patientLastName: null,
      patientEmail: 'explicit@example.com',
      integratorBranchId: null,
      branchName: null,
      dateTimeEnd: null,
      serviceId: null,
      serviceName: null,
      rubitimeCooperatorId: null,
      integratorUserId: null,
    });
    expect(fanout.payload.patientEmail).toBe('explicit@example.com');
  });
});
