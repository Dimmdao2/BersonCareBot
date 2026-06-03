import {
  DOCTOR_CLIENT_PROGRAM_SECTION_ANCHOR,
  doctorClientProfileHref,
} from "./doctorClientProfileHref";

/** Stable UUID for editor / instance detail tests. */
export const TEST_EDITOR_PATIENT_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const TEST_EDITOR_PATIENT_PROFILE_HREF = doctorClientProfileHref(TEST_EDITOR_PATIENT_USER_ID, {
  profileListScope: "appointments",
  hash: DOCTOR_CLIENT_PROGRAM_SECTION_ANCHOR,
});
