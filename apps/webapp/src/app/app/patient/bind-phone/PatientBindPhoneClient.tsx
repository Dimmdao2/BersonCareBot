"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useState } from "react";
import { ensureMessengerMiniAppWebappSession } from "@/shared/lib/miniAppSessionRecovery";
import {
  getPatientMessengerContactGateDetail,
  resolveBotHrefAfterMessengerSessionLoss,
  resolveMessengerContactGateBotHref,
} from "@/shared/lib/patientMessengerContactGate";
import { closeMessengerMiniApp, isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { postPatientMessengerRequestContact } from "@/shared/lib/patientMessengerContactClient";
import toast from "react-hot-toast";
import { BindPhoneBlock } from "@/shared/ui/auth/BindPhoneBlock";
import { PatientSharePhoneViaBotPanel } from "@/shared/ui/patient/PatientSharePhoneViaBotPanel";

type Props = {
  telegramId: string;
  maxId: string;
  supportContactHref?: string;
  hint?: string;
};

/**
 * В Mini App с привязкой к боту не показываем ввод SMS на этой странице — только сценарий «контакт в боте».
 * В обычном браузере — Telegram Login / OTP по {@link BindPhoneBlock} (канал telegram vs web).
 */
export function PatientBindPhoneClient({ telegramId, maxId, supportContactHref, hint }: Props) {
  const router = useRouter();
  const tg = telegramId?.trim() ?? "";
  const mx = maxId?.trim() ?? "";
  const mini = isMessengerMiniAppHost();
  /** null — ждём решения или refresh после привязки номера (не показываем SMS в Mini App). */
  const [useMessengerPanel, setUseMessengerPanel] = useState<boolean | null>(null);
  const [botHref, setBotHref] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"blocked" | "timed_out" | "session_lost" | "me_unavailable">("blocked");

  const runRecoveryAndDecide = useCallback(async () => {
    await ensureMessengerMiniAppWebappSession(router);
    const detail = await getPatientMessengerContactGateDetail();
    if (detail.kind === "unauthenticated") {
      const href = await resolveBotHrefAfterMessengerSessionLoss();
      startTransition(() => {
        setBotHref(href);
        setPanelMode("session_lost");
        setUseMessengerPanel(true);
      });
      return;
    }
    if (detail.kind === "need_contact") {
      const href = await resolveMessengerContactGateBotHref(detail.hasTelegram, detail.hasMax);
      startTransition(() => {
        setBotHref(href);
        setPanelMode("blocked");
        setUseMessengerPanel(true);
      });
      return;
    }
    if (detail.kind === "me_unavailable") {
      const href = await resolveMessengerContactGateBotHref(Boolean(tg), Boolean(mx));
      startTransition(() => {
        setBotHref(href);
        setPanelMode("me_unavailable");
        setUseMessengerPanel(true);
      });
      return;
    }
    startTransition(() => setUseMessengerPanel(null));
    router.refresh();
  }, [router, tg, mx]);

  useEffect(() => {
    if (!mini || (!tg && !mx)) {
      startTransition(() => setUseMessengerPanel(false));
      return;
    }
    startTransition(() => setUseMessengerPanel(null));
    void runRecoveryAndDecide();
  }, [mini, tg, mx, runRecoveryAndDecide]);

  const onRetryMini = useCallback(() => {
    void runRecoveryAndDecide();
  }, [runRecoveryAndDecide]);

  const onProvideContactMini = useCallback(async () => {
    const r = await postPatientMessengerRequestContact();
    if (!r.ok) {
      toast.error(
        r.error === "no_messenger_binding"
          ? "Нет привязки к мессенджеру."
          : r.error === "rate_limited"
            ? "Подождите минуту перед повторной отправкой."
            : "Не удалось запросить контакт.",
      );
      return;
    }
    closeMessengerMiniApp();
  }, []);

  if (mini && (tg || mx)) {
    if (useMessengerPanel !== true) {
      return (
        <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground" role="status">
          Загрузка…
        </div>
      );
    }
    return (
      <PatientSharePhoneViaBotPanel
        mode={panelMode}
        botHref={botHref}
        onRetry={onRetryMini}
        variant="embedded"
        onProvideContact={onProvideContactMini}
      />
    );
  }

  return (
    <BindPhoneBlock
      channel={tg ? "telegram" : "web"}
      chatId={tg}
      supportContactHref={supportContactHref}
      hint={hint}
    />
  );
}
