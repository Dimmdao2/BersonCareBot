export const SAAS_TEST_FIXTURE_PACKET_KEYS: readonly string[];

export class SaasTestFixturePacketError extends Error {
  readonly code: string;
}

export function parseSaasTestFixturePacket(text: string): Readonly<Record<string, string>>;

export function resolveDeployGroupId(groupFile?: string): number;

export function validateSaasTestFixturePacketMetadata(
  metadata: {
    uid: number;
    gid: number;
    mode: number;
    isSymbolicLink(): boolean;
    isFile(): boolean;
  },
  expected: { expectedGroupId: number; expectedOwnerId?: number },
): void;

export function readSaasTestFixturePacket(input: {
  filePath: string;
  expectedGroupId: number;
  expectedOwnerId?: number;
}): Readonly<Record<string, string>>;
