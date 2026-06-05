export type EmailSendResult = { ok: true } | { ok: false; error: string };

export type EmailSendPort = {
  sendCode: (to: string, code: string) => Promise<EmailSendResult>;
};

let emailSendPort: EmailSendPort | undefined;

export function bindEmailSendPort(port: EmailSendPort): void {
  emailSendPort = port;
}

function requireEmailSendPort(): EmailSendPort {
  if (!emailSendPort) {
    throw new Error("EmailSendPort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.");
  }
  return emailSendPort;
}

export async function sendEmailAuthCode(to: string, code: string): Promise<EmailSendResult> {
  return requireEmailSendPort().sendCode(to, code);
}
