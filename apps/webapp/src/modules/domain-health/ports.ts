export type DomainHealthTarget = {
  hostname: string;
};

export type DomainHealthCandidatePort = {
  /** Every normalized non-empty `org_custom_domain_hostname`; no tenant data leaves the DB root. */
  listConfiguredTargets(): Promise<DomainHealthTarget[]>;
};
