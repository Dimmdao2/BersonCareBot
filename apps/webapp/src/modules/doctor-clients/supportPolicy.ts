/** Per-organization patient row from `doctor_patient_support` (null row = defaults only). */
export type ClientSupportProfile = {
  organizationId: string;
  patientUserId: string;
  onSupport: boolean;
  /** Момент начала сопровождения (ISO); null если не на сопровождении. */
  supportStartedAt: string | null;
  commentsEnabled: boolean | null;
  mediaEnabled: boolean | null;
  directChatEnabled?: boolean | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type DoctorSupportWithoutSupportDefaults = {
  commentsEnabled: boolean;
  mediaEnabled: boolean;
};

export type PatientProgramInteractionPolicy = {
  organizationId: string;
  onSupport: boolean;
  commentsAllowed: boolean;
  mediaAllowed: boolean;
};

export type ClientChannelPolicy = Readonly<{
  directChatAllowed: boolean;
  commentsAllowed: boolean;
  mediaAllowed: boolean;
}>;

/**
 * The one organization-scoped client policy resolver. Explicit profile choices always win;
 * otherwise the corresponding workspace default decides, with `on_support` reading only the
 * accepted existing `onSupport` property. Workspace/dependency availability remains an earlier
 * gate and is intentionally not represented here.
 */
export function resolveClientChannelPolicy(params: {
  profile: ClientSupportProfile | null;
  defaults: Readonly<Record<'direct_chat' | 'program_comments' | 'program_media', 'off' | 'all' | 'on_support'>>;
}): ClientChannelPolicy {
  const allows = (override: boolean | null | undefined, mode: 'off' | 'all' | 'on_support') =>
    override ?? (mode === 'all' || (mode === 'on_support' && params.profile?.onSupport === true));
  return {
    directChatAllowed: allows(params.profile?.directChatEnabled, params.defaults.direct_chat),
    commentsAllowed: allows(params.profile?.commentsEnabled, params.defaults.program_comments),
    mediaAllowed: allows(params.profile?.mediaEnabled, params.defaults.program_media),
  };
}

export function resolvePatientProgramInteractionPolicy(params: {
  organizationId: string;
  profile: ClientSupportProfile | null;
  defaultsWithoutSupport: DoctorSupportWithoutSupportDefaults;
}): PatientProgramInteractionPolicy {
  if (params.profile && params.profile.organizationId !== params.organizationId) {
    throw new Error('support_profile_organization_mismatch');
  }
  const organizationId = params.organizationId;
  const onSupport = params.profile?.onSupport ?? false;
  if (onSupport) {
    return {
      organizationId,
      onSupport: true,
      commentsAllowed: params.profile?.commentsEnabled !== false,
      mediaAllowed: params.profile?.mediaEnabled !== false,
    };
  }
  return {
    organizationId,
    onSupport: false,
    commentsAllowed:
      params.profile?.commentsEnabled === true ||
      (params.profile?.commentsEnabled == null && params.defaultsWithoutSupport.commentsEnabled),
    mediaAllowed:
      params.profile?.mediaEnabled === true ||
      (params.profile?.mediaEnabled == null && params.defaultsWithoutSupport.mediaEnabled),
  };
}

export function parseDoctorSupportDefaultEnabled(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === 'object' &&
    (valueJson as Record<string, unknown>).value === true
  );
}
