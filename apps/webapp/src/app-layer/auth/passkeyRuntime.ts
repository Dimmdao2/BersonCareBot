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

export function beginPatientPasskeyRegistration(userId: string) {
  return beginPasskeyRegistration(userId, pgPasskeyStore);
}

export function finishPatientPasskeyRegistration(input: {
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
