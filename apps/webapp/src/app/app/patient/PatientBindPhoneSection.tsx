"use client";

import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { BindPhoneBlock } from "@/shared/ui/auth/BindPhoneBlock";

type Props = {
  phoneChannel: "telegram" | "web";
  phoneChatId: string;
  nextPath: string;
};

/** Блок привязки телефона на страницах кабинета / уведомлений (без редиректа на /bind-phone). */
export function PatientBindPhoneSection({ phoneChannel, phoneChatId, nextPath }: Props) {
  const router = useRouter();
  return (
    <section id="patient-bind-phone-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
      <h2>Привяжите номер телефона</h2>
      <p className="text-muted-foreground text-sm">
        Для доступа к этому разделу нужен подтверждённый номер или подключённый мессенджер из профиля.
      </p>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Загрузка…</p>}>
        <BindPhoneBlock
          channel={phoneChannel}
          chatId={phoneChatId}
          nextPathOverride={nextPath}
          onBindSuccess={() => router.refresh()}
        />
      </Suspense>
    </section>
  );
}
