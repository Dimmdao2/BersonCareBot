export type DevBypassPlatformUserPhonePort = {
  applyClientPhone: (userId: string, phone: string) => Promise<void>;
  applyStaffPhone: (userId: string, phone: string) => Promise<void>;
};

let devBypassPhonePort: DevBypassPlatformUserPhonePort | undefined;

export function bindDevBypassPlatformUserPhonePort(port: DevBypassPlatformUserPhonePort): void {
  devBypassPhonePort = port;
}

function requireDevBypassPhonePort(): DevBypassPlatformUserPhonePort {
  if (!devBypassPhonePort) {
    throw new Error("DevBypassPlatformUserPhonePort is not bound. Call ensureAuthModulePortsBound().");
  }
  return devBypassPhonePort;
}

export async function applyDevBypassPlatformUserPhoneInDb(
  userId: string,
  role: string,
  phone: string,
): Promise<void> {
  const port = requireDevBypassPhonePort();
  if (role === "client") {
    await port.applyClientPhone(userId, phone);
  } else {
    await port.applyStaffPhone(userId, phone);
  }
}
