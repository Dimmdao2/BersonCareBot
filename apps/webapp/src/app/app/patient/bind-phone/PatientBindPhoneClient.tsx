"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { usePatientPhonePromptChrome } from "@/shared/ui/patient/PatientPhonePromptChromeContext";
import {
  getPatientMessengerContactGateDetail,
  resolveBotHrefAfterMessengerSessionLoss,
  resolveMessengerContactGateBotHref,
} from "@/shared/lib/patientMessengerContactGate";
import { emitAuthFlowEvent } from "@/modules/auth/authFlowObservability";
import { readMessengerBindingCandidate } from "@/shared/lib/messengerBindingCandidate";
import { closeMessengerMiniApp, inferMessengerChannelForRequestContact, isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { postPatientMessengerRequestContact } from "@/shared/lib/patientMessengerContactClient";
import toast from "react-hot-toast";
import { PatientSharePhoneViaBotPanel } from "@/shared/ui/patient/PatientSharePhoneViaBotPanel";
import { PatientBrowserMessengerBindPanel } from "./PatientBrowserMessengerBindPanel";
import { patientMutedTextClass, PatientShimmerPanel } from "@/shared/ui/patientVisual";

type Props = {
  telegramId: string;
  maxId: string;
  supportContactHref?: string;
  hint?: string;
};

/**
 * Единый блок «контакт в боте» (`PatientSharePhoneViaBotPanel`) в Mini App и в браузере при привязке TG/Max.
 * Без привязки к мессенджеру — {@link PatientBrowserMessengerBindPanel}. SMS не используется.
 */
export function PatientBindPhoneClient({ telegramId, maxId, supportContactHref, hint }: Props) {
  const phoneChrome = usePatientPhonePromptChrome();
  const tg = telegramId?.trim() ?? "";
  const mx = maxId?.trim() ?? "";
  /** null — ждём решения или refresh после привязки номера. */
  const [useMessengerPanel, setUseMessengerPanel] = useState<boolean | null>(null);
  const [botHref, setBotHref] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"blocked" | "timed_out" | "session_lost" | "me_unavailable">("blocked");
  const postAuthBindingEmittedRef = useRef(false);

  const runRecoveryAndDecide = useCallback(async () => {
    try {
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
    } catch {
      const href = await resolveMessengerContactGateBotHref(Boolean(tg), Boolean(mx));
      startTransition(() => {
        setBotHref(href);
        setPanelMode("me_unavailable");
        setUseMessengerPanel(true);
      });
    }
  }, [tg, mx]);

  useEffect(() => {
    if (!tg && !mx) {
      startTransition(() => setUseMessengerPanel(false));
      return;
    }
    startTransition(() => setUseMessengerPanel(null));
    void runRecoveryAndDecide();
  }, [tg, mx, runRecoveryAndDecide]);

  useEffect(() => {
    if (!phoneChrome || !isMessengerMiniAppHost()) {
      return;
    }
    const onPhoneFlow = Boolean(tg || mx) && (useMessengerPanel === true || useMessengerPanel === null);
    phoneChrome.setSuppressPatientHeader(onPhoneFlow);
    return () => phoneChrome.setSuppressPatientHeader(false);
  }, [phoneChrome, tg, mx, useMessengerPanel]);

  useEffect(() => {
    if (!isMessengerMiniAppHost() || useMessengerPanel !== true || postAuthBindingEmittedRef.current) {
      return;
    }
    postAuthBindingEmittedRef.current = true;
    const channel = inferMessengerChannelForRequestContact();
    emitAuthFlowEvent("post_auth_binding_required", {
      reason: "oauth_in_miniapp_no_bot_phone",
      panelMode,
      hasBindings: Boolean(tg || mx),
      channel: channel ?? "unknown",
      hasDeferredMessengerInitCandidate: Boolean(readMessengerBindingCandidate()),
    });
  }, [useMessengerPanel, panelMode, tg, mx]);

  const onRetryMini = useCallback(() => {
    void runRecoveryAndDecide();
  }, [runRecoveryAndDecide]);

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

  const onProvideContact = useCallback(async () => {
    if (isMessengerMiniAppHost()) {
      const r = await postPatientMessengerRequestContact();
      if (!r.ok) {
        if (r.error === "not_required") {
          closeMessengerMiniApp();
          await runRecoveryAndDecide();
          return;
        }
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
      return;
    }
    const inferred = inferMessengerChannelForRequestContact();
    const channel: "telegram" | "max" | null =
      inferred ?? (tg && !mx ? "telegram" : mx && !tg ? "max" : tg ? "telegram" : mx ? "max" : null);
    if (!channel) {
      toast.error("Не удалось определить мессенджер.");
      return;
    }
    await requestContactBrowser(channel);
  }, [tg, mx, requestContactBrowser, runRecoveryAndDecide]);

  if (tg || mx) {
    if (useMessengerPanel !== true) {
      return (
        <div
          className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-2"
          role="status"
          aria-busy="true"
          aria-label="Загрузка"
        >
          <PatientShimmerPanel />
        </div>
      );
    }
    return (
      <div id="patient-bind-phone-messenger-unified" className="flex flex-col gap-4">
        {hint ? <p className={patientMutedTextClass}>{hint}</p> : null}
        <PatientSharePhoneViaBotPanel
          mode={panelMode}
          botHref={botHref}
          onRetry={onRetryMini}
          variant="embedded"
          onProvideContact={onProvideContact}
          showRetryButton
          supportContactHref={supportContactHref}
        />
      </div>
    );
  }

  return <PatientBrowserMessengerBindPanel hint={hint} supportContactHref={supportContactHref} />;
}
