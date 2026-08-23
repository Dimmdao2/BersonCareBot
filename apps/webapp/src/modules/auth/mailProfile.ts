export type MailProfileRequest =
  | { kind: 'platform'; senderDisplayName: string }
  | {
      kind: 'branded';
      organizationId: string;
      clinicName: string;
      platformName: string;
    };

export function platformMailProfile(senderDisplayName: string): MailProfileRequest {
  return { kind: 'platform', senderDisplayName };
}

export function brandedMailProfile(input: {
  organizationId: string;
  clinicName: string;
  platformName: string;
}): MailProfileRequest {
  return { kind: 'branded', ...input };
}
