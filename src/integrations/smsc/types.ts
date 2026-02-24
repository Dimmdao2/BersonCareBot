export type SendSmsInput = {
  toPhone: string;
  message: string;
};

export type SendSmsResult =
  | { ok: true }
  | { ok: false; error: string };

export type SmsClient = {
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
};
