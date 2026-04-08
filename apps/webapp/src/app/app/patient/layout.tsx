import type { ReactNode } from "react";
import { MiniAppShareContactGate } from "@/shared/ui/patient/MiniAppShareContactGate";

/**
 * Обёртка пациентского раздела: в Telegram Mini App без телефона в webapp — полноэкранная подсказка
 * «поделитесь контактом в боте» (см. docs/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md).
 */
export default function PatientLayout({ children }: { children: ReactNode }) {
  return <MiniAppShareContactGate>{children}</MiniAppShareContactGate>;
}
