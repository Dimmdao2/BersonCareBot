"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import toast from "react-hot-toast";
import type { LandingInstallPlatform } from "@/components/landing/detectLandingInstallPlatform";

const REQUIRED_BROWSER: Record<LandingInstallPlatform, string> = {
  ios: "Safari",
  android: "Chrome",
};

const SITE_URL = "bersoncare.ru";
const SITE_HREF = "https://bersoncare.ru";

export function WrongBrowserBanner({ platform }: { platform: LandingInstallPlatform }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(SITE_HREF).then(() => {
      setCopied(true);
      toast("Ссылка скопирована");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const browser = REQUIRED_BROWSER[platform];

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-[#FECACA] bg-[#FFF1F1] px-4 py-3.5 text-[0.9375rem] leading-6 text-[#991B1B]"
    >
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]"
        aria-hidden
      />
      <span className="min-w-0">
        <span className="font-semibold">
          Установка работает только через {browser}.
        </span>{" "}
        Скопируйте ссылку{" "}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-white/70 px-1.5 py-0.5 font-mono text-[0.8125rem] font-medium text-[#991B1B] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40"
        >
          {SITE_URL}
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
        </button>{" "}
        и откройте сайт в {browser}.
      </span>
    </div>
  );
}
