import { env } from "@/config/env";

let warnedMissingIntegratorUrl = false;

/**
 * Заглушка relay в integrator (этап 8.3.3). Без секретов в репозитории.
 * При включённом канале доставки — расширить вызовом существующего HTTP-клиента integrator.
 */
export async function maybeRelayOutbound(_info: { kind: "patient" | "admin"; text: string }): Promise<void> {
  if (!env.INTEGRATOR_API_URL?.trim()) {
    if (process.env.NODE_ENV !== "test" && !warnedMissingIntegratorUrl) {
      warnedMissingIntegratorUrl = true;
      console.warn("[messaging] relay: INTEGRATOR_API_URL не задан — исходящий relay отключён, сообщения только в БД");
    }
    return;
  }
  // TODO: POST к существующему API integrator при появлении контракта доставки чата.
}
