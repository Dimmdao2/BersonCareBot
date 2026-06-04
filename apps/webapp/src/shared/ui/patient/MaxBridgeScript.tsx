"use client";

import { useEffect } from "react";

const MAX_BRIDGE_SRC = "https://st.max.ru/js/max-web-app.js";

/**
 * Подключает MAX WebApp bridge только когда нет JWT в query — иначе отложенный `auth/exchange`
 * конфликтует с глобальным `window.WebApp` из скрипта MAX в обычном браузере.
 */
export function MaxBridgeScript({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    if (document.querySelector(`script[src="${MAX_BRIDGE_SRC}"][data-bc-max-bridge="1"]`)) return;
    const s = document.createElement("script");
    s.src = MAX_BRIDGE_SRC;
    s.async = true;
    s.dataset.bcMaxBridge = "1";
    document.body.appendChild(s);
  }, [active]);

  return null;
}
