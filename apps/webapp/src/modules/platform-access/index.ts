export type { ClientAccessTier, PlatformAccessContext, PlatformAccessResolution, PlatformDbRole } from "./types";
export type { PatientPhoneCanonRow } from "./trustedPhonePolicy";
export {
  isTrustedPatientPhoneActivation,
  PATIENT_PHONE_TRUST_COLUMN,
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "./trustedPhonePolicy";
export { resolvePlatformAccessContext, type ResolvePlatformAccessContextInput } from "./resolvePlatformAccessContext";
export { patientClientBusinessGate, type PatientBusinessGate } from "./patientClientBusinessGate";
export {
  type HeaderGetter,
  PATIENT_BUSINESS_API_PREFIXES,
  PATIENT_ONBOARDING_SERVER_ACTION_PAGE_PREFIXES,
  patientApiPathIsPatientBusinessSurface,
  patientPageMinAccessTier,
  patientPathRequiresBoundPhone,
  patientPathsAllowedDuringPhoneActivation,
  patientServerActionPageAllowsOnboardingOnly,
  patientSessionSnapshotHasPhone,
  resolvePatientLayoutPathname,
} from "./patientRouteApiPolicy";
export { patientOnboardingServerActionSurfaceOk } from "./onboardingServerActionSurface";
