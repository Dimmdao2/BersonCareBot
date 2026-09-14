import type { Lead, NormalizedLeadInput, RejectLeadInput, SubmitLeadInput } from './types';

export type LeadsPort = {
  create(input: NormalizedLeadInput, now: string): Promise<Lead>;
  list(input: { organizationId: string; includeArchived: boolean; limit: number }): Promise<Lead[]>;
  get(organizationId: string, leadId: string): Promise<Lead | null>;
  accept(organizationId: string, leadId: string, now: string): Promise<Lead | null>;
  close(organizationId: string, leadId: string, now: string): Promise<Lead | null>;
  reject(input: RejectLeadInput & { now: string; comment: string | null }): Promise<Lead | null>;
  setArchived(
    organizationId: string,
    leadId: string,
    archived: boolean,
    now: string,
  ): Promise<Lead | null>;
};

export type LeadsService = {
  submit(input: SubmitLeadInput): Promise<Lead>;
  list(input: Parameters<LeadsPort['list']>[0]): Promise<Lead[]>;
  get(organizationId: string, leadId: string): Promise<Lead | null>;
  accept(organizationId: string, leadId: string): Promise<Lead | null>;
  close(organizationId: string, leadId: string): Promise<Lead | null>;
  reject(input: RejectLeadInput): Promise<Lead | null>;
  archive(organizationId: string, leadId: string): Promise<Lead | null>;
  unarchive(organizationId: string, leadId: string): Promise<Lead | null>;
};
