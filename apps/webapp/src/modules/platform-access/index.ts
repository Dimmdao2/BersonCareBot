export type { ClientAccessTier, PlatformAccessContext, PlatformAccessResolution, PlatformDbRole } from "./types";
export type { PatientPhoneCanonRow } from "./trustedPhonePolicy";
export {
  isTrustedPatientPhoneActivation,
  PATIENT_PHONE_TRUST_COLUMN,
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "./trustedPhonePolicy";
export { resolvePlatformAccessContext, type ResolvePlatformAccessContextInput } from "./resolvePlatformAccessContext";
