export type PlatformAccessCanonRow = {
  role: string;
  phone_normalized: string | null;
  patient_phone_trust_at: Date | null;
  email_verified_at: Date | null;
  has_password_credentials: boolean;
  has_web_oauth_binding: boolean;
};

export type PlatformAccessPort = {
  resolveCanonicalUserId(userId: string): Promise<string | null>;
  loadCanonRow(canonicalUserId: string): Promise<PlatformAccessCanonRow | null>;
};

let boundPlatformAccessPort: PlatformAccessPort | null = null;

export function bindPlatformAccessPort(port: PlatformAccessPort): void {
  boundPlatformAccessPort = port;
}

export function getPlatformAccessPort(): PlatformAccessPort {
  if (!boundPlatformAccessPort) {
    throw new Error("platform_access_port_not_bound");
  }
  return boundPlatformAccessPort;
}

export function resetPlatformAccessPortForTests(): void {
  boundPlatformAccessPort = null;
}
