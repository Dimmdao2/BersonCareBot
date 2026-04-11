"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ensureMessengerMiniAppWebappSession } from "@/shared/lib/miniAppSessionRecovery";
import {
  getPatientMessengerContactGateDetail,
  resolveBotHrefAfterMessengerSessionLoss,
  resolveMessengerContactGateBotHref,
} from "@/shared/lib/patientMessengerContactGate";
import { closeMessengerMiniApp, isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { postPatientMessengerRequestContact } from "@/shared/lib/patientMessengerContactClient";
import toast from "react-hot-toast";
import { PatientSharePhoneViaBotPanel } from "@/shared/ui/patient/PatientSharePhoneViaBotPanel";
import { PatientBrowserMessengerBindPanel } from "./PatientBrowserMessengerBindPanel";

type Props = {
  telegramId: string;
  maxId: string;
  supportContactHref?: string;
  hint?: string;
};

/**
 * Mini App с привязкой к боту — панель «контакт в боте» (`PatientSharePhoneViaBotPanel`).
 * Браузер: без TG/Max — {@link PatientBrowserMessengerBindPanel} (channel-link); с привязкой — запрос контакта через API + опрос `router.refresh`. SMS не используется.
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

  useEffect(() => {
    if (mini || (!tg && !mx)) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [mini, tg, mx, router]);

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

  const requestContactBrowser = useCallback(async (channel: "telegram" | "max") => {
    const r = await postPatientMessengerRequestContact(channel);
    if (!r.ok) {
      toast.error(
        r.error === "contact_channel_required"
          ? "Выберите мессенджер."
          : r.error === "no_messenger_binding"
            ? "Нет привязки к мессенджеру."
            : r.error === "rate_limited"
              ? "Подождите минуту перед повторной отправкой."
              : "Не удалось запросить контакт.",
      );
      return;
    }
    toast.success("Откройте чат с ботом и отправьте контакт по кнопке.");
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

  if (!tg && !mx) {
    return <PatientBrowserMessengerBindPanel hint={hint} supportContactHref={supportContactHref} />;
  }

  return (
    <div id="patient-bind-phone-messenger-contact" className="flex flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Привязка телефона</p>
      <p className="text-muted-foreground text-sm">
        {hint ??
          "Чтобы подтвердить номер, отправьте контакт боту в мессенджере — нажмите кнопку ниже и следуйте подсказкам в чате."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {tg ? (
          <Button type="button" variant="outline" className="flex-1" onClick={() => void requestContactBrowser("telegram")}>
            Запросить контакт в Telegram
          </Button>
        ) : null}
        {mx ? (
          <Button type="button" variant="outline" className="flex-1" onClick={() => void requestContactBrowser("max")}>
            Запросить контакт в Max
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        После отправки номера в боте эта страница обновится сама (около раз в 4 секунды).
      </p>
      {supportContactHref ? (
        <a href={supportContactHref} className="text-sm text-primary underline">
          Связаться с поддержкой
        </a>
      ) : null}
    </div>
  );
}
