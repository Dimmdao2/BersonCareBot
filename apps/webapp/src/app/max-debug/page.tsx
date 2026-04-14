"use client";

import { useEffect, useState } from "react";
import { MaxBridgeScript } from "@/shared/ui/MaxBridgeScript";

type MaxUnsafe = Record<string, unknown>;

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Диагностика MAX Mini App: URL, User-Agent, наличие `window.WebApp`, initData / initDataUnsafe, platform, version.
 */
export default function MaxDebugPage() {
  const [ua, setUa] = useState("");
  const [href, setHref] = useState("");
  const [search, setSearch] = useState("");
  const [hasWebApp, setHasWebApp] = useState(false);
  const [initData, setInitData] = useState("");
  const [initDataUnsafe, setInitDataUnsafe] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");
  const [version, setVersion] = useState<string>("");

  const readWebApp = () => {
    setUa(typeof navigator !== "undefined" ? navigator.userAgent : "");
    setHref(typeof window !== "undefined" ? window.location.href : "");
    setSearch(typeof window !== "undefined" ? window.location.search : "");

    const w = (window as Window & {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: MaxUnsafe;
        platform?: string;
        version?: string;
      };
    }).WebApp;

    setHasWebApp(typeof w !== "undefined");
    if (w) {
      setInitData(typeof w.initData === "string" ? w.initData : "");
      setInitDataUnsafe(
        w.initDataUnsafe != null && typeof w.initDataUnsafe === "object"
          ? safeJson(w.initDataUnsafe)
          : "",
      );
      setPlatform(typeof w.platform === "string" ? w.platform : "");
      setVersion(typeof w.version === "string" ? w.version : "");
    }
  };

  useEffect(() => {
    const id = window.setInterval(readWebApp, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 20000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6 font-mono text-sm">
      <MaxBridgeScript active />
      <h1 className="text-lg font-semibold">MAX Mini App debug</h1>
      <section>
        <h2 className="mb-2 font-medium">Location</h2>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border bg-muted/40 p-3">{href}</pre>
        <p className="mt-2 text-muted-foreground">location.search</p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border bg-muted/40 p-3">{search || "(empty)"}</pre>
      </section>
      <section>
        <h2 className="mb-2 font-medium">navigator.userAgent</h2>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border bg-muted/40 p-3">{ua || "—"}</pre>
      </section>
      <section>
        <h2 className="mb-2 font-medium">window.WebApp</h2>
        <p>{hasWebApp ? "present" : "absent"}</p>
      </section>
      <section>
        <h2 className="mb-2 font-medium">window.WebApp.initData</h2>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border bg-muted/40 p-3">
          {initData ? initData : "(empty)"}
        </pre>
      </section>
      <section>
        <h2 className="mb-2 font-medium">window.WebApp.initDataUnsafe</h2>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border bg-muted/40 p-3">
          {initDataUnsafe || "(empty)"}
        </pre>
      </section>
      <section>
        <h2 className="mb-2 font-medium">platform / version</h2>
        <p>platform: {platform || "—"}</p>
        <p>version: {version || "—"}</p>
      </section>
    </main>
  );
}
