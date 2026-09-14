import { describe, expect, it, vi } from 'vitest';
import { createLeadsService } from './service';
import type { LeadsPort } from './ports';
import type { SubmitLeadInput, VerifiedLeadApplicant } from './types';

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
