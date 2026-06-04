"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { LegalFooterLinks } from "@/shared/ui/patient/LegalFooterLinks";
import { PatientSupportForm } from "@/app/app/patient/support/PatientSupportForm";
import { readAuthFlowPending } from "@/shared/ui/patient/auth/authFlowPendingStorage";
import { cn } from "@/lib/utils";
import {
  patientCardClass,
  patientInlineLinkClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";

function backNavFromSearchParams(initialFrom?: string | null): { href: string; label: string } {
  const from = initialFrom ?? "";
  if (from === "verify") return { href: "/app", label: "Вернуться к коду" };
  if (from === "reset") return { href: "/app", label: "Вернуться к восстановлению пароля" };
  if (from === "login") return { href: "/app", label: "Вернуться к входу" };
  return { href: "/app", label: "К входу" };
}

function backNavMerged(initialFrom?: string | null): { href: string; label: string } {
  const pending = readAuthFlowPending();
  if (pending?.mode === "register_verify") {
    return { href: "/app", label: "Вернуться к коду" };
  }
  if (pending?.mode === "password_reset") {
    return { href: "/app", label: "Вернуться к восстановлению пароля" };
  }
  return backNavFromSearchParams(initialFrom);
}

type Props = { initialFrom?: string | string[] | null };

export default function LoginContactSupportPageClient({ initialFrom }: Props) {
  const fromParam =
    typeof initialFrom === "string" ? initialFrom : Array.isArray(initialFrom) ? initialFrom[0] : undefined;
  const pending = readAuthFlowPending();
  const nav = (() => {
    if (pending?.mode === "register_verify") return { href: "/app", label: "Вернуться к коду" };
    if (pending?.mode === "password_reset") return { href: "/app", label: "Вернуться к восстановлению пароля" };
    return backNavFromSearchParams(fromParam);
  })();

  const prefillEmail =
    pending?.mode === "register_verify" || pending?.mode === "password_reset" ? pending.email ?? "" : "";

  return (
    <PatientAppShell
      title="BersonCare"
      user={null}
     
      backHref={nav.href}
      backLabel={nav.label}
      patientHideHome
      patientHideRightIcons
      patientBrandTitleBar
      patientHideBottomNav
    >
      <section id="login-contact-support-section" className={cn(patientCardClass, "flex flex-col gap-4 pb-24")}>
        <div>
          <h2 className={patientSectionTitleClass}>Написать в поддержку</h2>
          <p className={cn(patientMutedTextClass, "mt-1")}>
            Сообщение уйдёт администратору. Укажите email — на него ответят при необходимости.
          </p>
        </div>
        <PatientSupportForm defaultEmail={prefillEmail} supportSubmitPath="/api/public/support" />
        <p className="mt-1 text-center">
          <Link href={nav.href} className={cn(patientInlineLinkClass, "text-sm font-medium")}>
            {nav.label}
          </Link>
        </p>
      </section>
      <LegalFooterLinks className="mt-8" />
    </PatientAppShell>
  );
}
