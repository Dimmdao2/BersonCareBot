"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function JoinStartClient() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const bearer = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    window.history.replaceState(null, "", "/join/start");
    if (bearer.length < 32) {
      queueMicrotask(() => setFailed(true));
      return;
    }
    void fetch("/api/join/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bearer }),
      cache: "no-store",
    })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as { ok?: unknown; redirectTo?: unknown } | null;
        if (!response.ok || json?.ok !== true || typeof json.redirectTo !== "string") {
          throw new Error("join_exchange_failed");
        }
        router.replace(json.redirectTo);
      })
      .catch(() => setFailed(true));
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <div className="w-full rounded-xl border border-border bg-card p-5 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {failed ? "Ссылка недействительна" : "Проверяем приглашение…"}
        </h1>
        {failed ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Попросите специалиста создать новую ссылку.
          </p>
        ) : null}
      </div>
    </main>
  );
}
