import {
  getCurrentDbPrincipalOrganizationId,
  runWithDbOrganizationPrincipal,
} from '@bersoncare/db-principal';

export const getCurrentOrganizationPrincipalId = getCurrentDbPrincipalOrganizationId;
export const runWithOrganizationPrincipal = runWithDbOrganizationPrincipal;
