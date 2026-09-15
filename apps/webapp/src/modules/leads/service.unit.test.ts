import { describe, expect, it, vi } from 'vitest';
import { createLeadsService } from './service';
import type { LeadsPort } from './ports';
import type { Lead, SubmitLeadInput, VerifiedLeadApplicant } from './types';

function rejectingPort() {
  const create = vi.fn<LeadsPort['create']>(async () => {
    throw new Error('unexpected lead create');
  });
  const port: LeadsPort = {
    create,
    async list() {
      return [];
    },
    async get() {
      return null;
    },
    async accept() {
      return null;
    },
    async close() {
      return null;
    },
    async reject() {
      return null;
    },
    async setArchived() {
      return null;
    },
  };
  return { port, create };
}

const applicant = {
  platformUserId: 'user-1',
  emailNormalized: 'person@example.com',
  proof: 'email_otp' as const,
} as VerifiedLeadApplicant;
const submission = (organizationId = 'org-a'): SubmitLeadInput => ({
  organizationId,
  applicant,
  email: 'person@example.com',
  phone: '+79991234567',
  messageText: 'Нужна консультация',
  sourceSurface: 'public_page',
});

const createdLead = (organizationId: string): Lead =>
  ({
    id: 'lead-1',
    organizationId,
    platformUserId: 'user-1',
    submittedEmail: 'person@example.com',
    messageText: 'Нужна консультация',
    status: 'new',
    sourceSurface: 'public_page',
  }) as Lead;

function creatingPort(organizationId = 'org-a') {
  const create = vi.fn<LeadsPort['create']>(async () => createdLead(organizationId));
  const port = { ...rejectingPort().port, create } as LeadsPort;
  return { port, create };
}

describe('lead lifecycle', () => {
  it('does not create a lead before the applicant has proved the submitted email', async () => {
    const fake = rejectingPort();
    const service = createLeadsService(fake.port);
    await expect(service.submit({ ...submission(), applicant: null })).rejects.toThrow(
      'lead_email_verification_required',
    );
    await expect(
      service.submit({
        ...submission(),
        applicant: { ...applicant, emailNormalized: 'other@example.com' },
      }),
    ).rejects.toThrow('lead_email_verification_required');
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('refuses every write when the leads mechanic is disabled', async () => {
    const fake = rejectingPort();
    const service = createLeadsService(fake.port, {
      assertWriteClearance: () => {
        throw new Error('mechanic_disabled');
      },
    });
    await expect(service.submit(submission())).rejects.toThrow('mechanic_disabled');
    expect(fake.create).not.toHaveBeenCalled();
  });
});

/**
 * Поломка: отказ канала уведомления валит САМО создание заявки.
 * Последствие: строка заявки уже записана и учётная запись человека уже заведена, а публичная
 * дверь отвечает 500 `lead_submit_failed` — человек видит отказ и отправляет заявку снова
 * (дубль), клиника при этом не узнаёт ни о первой, ни о второй. Уведомление — следствие
 * созданной заявки, а не условие её создания; оба соседних производителя того же уведомления
 * (`notifyDoctorPatientMessage`, `notifyDoctorPatientProgramNote`) зовут его как
 * `void … .catch(log)` именно поэтому.
 */
describe('заявка не зависит от своего уведомления', () => {
  it('созданная заявка возвращается, даже если уведомить клинику не удалось', async () => {
    const fake = creatingPort();
    const service = createLeadsService(fake.port, {
      notifyClinicLeadCreated: async () => {
        throw new Error('permission denied for table be_organization_members');
      },
    });
    await expect(service.submit(submission())).resolves.toMatchObject({ id: 'lead-1' });
    expect(fake.create).toHaveBeenCalledTimes(1);
  });
});
