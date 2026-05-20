/** Pure helper for bind-phone redirect when phone is already trusted (testable). */
export function resolveSkipBindPhoneSurface(params: {
  databaseUrlSet: boolean;
  phoneTrustedForPatient?: boolean;
  platformContextFailed?: boolean;
  sessionSnapshotHasPhone: boolean;
}): boolean {
  if (!params.databaseUrlSet) {
    return params.sessionSnapshotHasPhone;
  }
  if (params.platformContextFailed) {
    return params.sessionSnapshotHasPhone;
  }
  return Boolean(params.phoneTrustedForPatient);
}
