import type { Lead, LeadStatus } from '@/modules/leads/types';

export type LeadFilter = 'all' | LeadStatus;
type LeadListItem = Pick<Lead, 'id' | 'status'>;

type VisibleLeadSelection<T extends LeadListItem> = {
  filteredLeads: T[];
  selectedLead: T | null;
};

/**
 * The list and detail pane must share this projection: a filtered-out lead has no actionable detail.
 */
export function resolveVisibleLeadSelection<T extends LeadListItem>(
  leads: readonly T[],
  filter: LeadFilter,
  selectedId: string | null,
): VisibleLeadSelection<T> {
  const filteredLeads = filter === 'all' ? [...leads] : leads.filter((lead) => lead.status === filter);
  const selectedLead = filteredLeads.find((lead) => lead.id === selectedId) ?? null;

  return { filteredLeads, selectedLead };
}
