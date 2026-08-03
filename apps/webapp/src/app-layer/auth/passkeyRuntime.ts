import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { pgPasskeyStore } from '@/infra/repos/pgPasskeyStore';
import { pgUserByPhonePort } from '@/infra/repos/pgUserByPhone';
import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
} from '@/modules/auth/passkeyAuth';

export function listPasskeyCredentials(userId: string) {
  return pgPasskeyStore.listCredentials(userId);
}

export function deletePasskeyCredential(userId: string, credentialId: string) {
  return pgPasskeyStore.deleteCredential(userId, credentialId);
}

/** Registration is shared across all roles (patient, doctor, admin) — the caller supplies the real name. */
export function beginSelfPasskeyRegistration(userId: string, userDisplayName: string) {
  return beginPasskeyRegistration(userId, userDisplayName, pgPasskeyStore);
}

export function finishSelfPasskeyRegistration(input: {
  userId: string;
  challengeId: string;
  response: RegistrationResponseJSON;
}) {
  return finishPasskeyRegistration(input, pgPasskeyStore);
}

export function beginPatientPasskeyAuthentication() {
  return beginPasskeyAuthentication(pgPasskeyStore);
}

export function finishPatientPasskeyAuthentication(input: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}) {
  return finishPasskeyAuthentication(input, pgPasskeyStore);
}

export function findPasskeyUserById(userId: string) {
  return pgUserByPhonePort.findByUserId(userId);
}
