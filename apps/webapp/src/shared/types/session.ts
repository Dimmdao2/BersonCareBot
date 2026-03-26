export type UserRole = "client" | "doctor" | "admin";

export type ChannelBindings = {
  telegramId?: string;
  vkId?: string;
  maxId?: string;
};

export type SessionUser = {
  userId: string;
  role: UserRole;
  displayName: string;
  phone?: string;
  bindings: ChannelBindings;
};

export type AppSession = {
  user: SessionUser;
  issuedAt: number;
  expiresAt: number;
  adminMode?: boolean;
  /** Подсказки UI сразу после входа (не для авторизации). */
  postLoginHints?: {
    phoneOtpChannel?: "sms" | "telegram" | "max" | "email";
  };
};
