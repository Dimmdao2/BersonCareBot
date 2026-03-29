"use client";

/**
 * Root global error UI (Next.js App Router). Must be a Client Component and include
 * its own <html>/<body> — it replaces the root layout when active. Keep minimal:
 * no providers/context from root layout, so prerender of /_global-error does not hit null React context.
 */
import type { ReactNode } from "react";

function isChunkLoadFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to load chunk") ||
    m.includes("loading chunk") ||
    m.includes("chunkloaderror")
  );
}

function hardReloadApp(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("_v", Date.now().toString());
  window.location.replace(url.toString());
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  const message = error.message || "Не удалось загрузить страницу.";
  const isChunkError = isChunkLoadFailure(message);

  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.25rem" }}>Произошла ошибка</h1>
        <p style={{ color: "#555" }}>{message}</p>
        {error.digest ? (
          <p style={{ fontSize: "0.75rem", color: "#888" }}>Код: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (isChunkError) {
              hardReloadApp();
              return;
            }
            reset();
          }}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}
        >
          {isChunkError ? "Обновить приложение" : "Попробовать снова"}
        </button>
      </body>
    </html>
  );
}
