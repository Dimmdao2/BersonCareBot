"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/shared/ui/patient/primitives/button";
import { buttonVariants } from "@/shared/ui/patient/primitives/button-variants";
import { routePaths } from "@/app-layer/routes/paths";
import { DEFAULT_SUPPORT_CONTACT_URL } from "@/modules/system-settings/supportContactConstants";
import { isStaleServerActionError } from "@/shared/lib/isStaleServerActionError";
import { safeReload } from "@/shared/lib/safeReload";
import { SupportContactLink } from "@/shared/ui/patient/SupportContactLink";
import { cn } from "@/lib/utils";

function resolveBackFallback(pathname: string): string {
  if (pathname.startsWith("/app/patient")) return routePaths.patient;
  if (pathname.startsWith("/app/doctor")) return routePaths.doctor;
  return routePaths.root;
}

/**
 * Локальный fallback для сегментных `error.tsx`: не заменяет корневой layout.
 */
export function SegmentRouteError({
  error,
  reset,
  backFallbackHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Куда перейти по «Назад», если в истории браузера некуда откатываться. */
  backFallbackHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [supportContactHref, setSupportContactHref] = useState(DEFAULT_SUPPORT_CONTACT_URL);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/public/support-contact-url")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean; url?: string } | null) => {
        const url = typeof data?.url === "string" ? data.url.trim() : "";
        if (!cancelled && url) setSupportContactHref(url);
      })
      .catch(() => {
        /* оставляем DEFAULT_SUPPORT_CONTACT_URL */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isStaleAction = isStaleServerActionError(error);

  useEffect(() => {
    if (!isStaleAction) return;
    void safeReload("stale-server-action");
  }, [isStaleAction]);

  const message = error.message || "Не удалось загрузить раздел.";
  const backFallback = backFallbackHref ?? resolveBackFallback(pathname);

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backFallback);
  };

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center"
      role="alert"
    >
      <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Код: {error.digest}</p>
      ) : null}
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            if (isStaleAction) {
              void safeReload("stale-server-action");
              return;
            }
            reset();
          }}
        >
          Попробовать снова
        </Button>
        <SupportContactLink
          href={supportContactHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full justify-center no-underline",
          )}
        >
          Связаться с поддержкой
        </SupportContactLink>
        <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
          Назад
        </Button>
      </div>
    </div>
  );
}
