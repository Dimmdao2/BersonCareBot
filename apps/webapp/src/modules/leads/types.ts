export const LEAD_STATUSES = [
  'new',
  'rejected',
  'accepted_in_progress',
  'accepted_closed',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCE_SURFACES = ['public_page', 'widget'] as const;
export type LeadSourceSurface = (typeof LEAD_SOURCE_SURFACES)[number];

declare const verifiedLeadApplicantBrand: unique symbol;

export type VerifiedLeadApplicant = {
  platformUserId: string;
  emailNormalized: string;
  proof: 'email_otp' | 'authenticated_session';
  readonly [verifiedLeadApplicantBrand]: true;
};

export type Lead = {
  id: string;
  organizationId: string;
  platformUserId: string;
  submittedFirstName: string | null;
  submittedLastName: string | null;
  submittedPatronymic: string | null;
  submittedEmail: string;
  submittedPhone: string | null;
  preferredContact: string | null;
  messageText: string;
  status: LeadStatus;
  rejectionComment: string | null;
  rejectedAt: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  sourceSurface: LeadSourceSurface;
  createdAt: string;
  updatedAt: string;
};

export type SubmitLeadInput = {
  organizationId: string;
  applicant: VerifiedLeadApplicant | null;
  firstName?: string | null;
  lastName?: string | null;
  patronymic?: string | null;
  email: string;
  phone?: string | null;
  preferredContact?: string | null;
  messageText: string;
  sourceSurface: LeadSourceSurface;
};

export type NormalizedLeadInput = {
  organizationId: string;
  platformUserId: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
  emailNormalized: string;
  phoneNormalized: string | null;
  preferredContact: string | null;
  messageText: string;
  sourceSurface: LeadSourceSurface;
};

export type RejectLeadInput = {
  organizationId: string;
  leadId: string;
  blockApplicant: boolean;
  comment?: string | null;
};
