export type DomainHealthTarget = {
  hostname: string;
  /** Present for canonical binding rows; omitted only by legacy/test adapters. */
  organizationId?: string;
  baseDomain?: string;
  placement?: 'apex' | 'subdomain';
  status?: 'pending' | 'dns_ready' | 'active' | 'failed' | 'suspended';
  organizationActive?: boolean;
  hasPublishedBrand?: boolean;
};

export type DomainHealthCandidatePort = {
  /** Canonical non-quarantined binding targets used by the single lifecycle verifier. */
  listConfiguredTargets(): Promise<DomainHealthTarget[]>;
};
