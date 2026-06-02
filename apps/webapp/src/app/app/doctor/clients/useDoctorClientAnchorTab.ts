"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DOCTOR_CLIENT_ANCHOR_TO_TAB,
  DOCTOR_CLIENT_TAB_IDS,
  type DoctorClientTabId,
} from "@/modules/doctor-client-card/types";

function parseHashAnchor(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim();
  return raw.length > 0 ? raw : null;
}

function scrollToAnchor(anchorId: string): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(anchorId);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function initialTabFromHash(defaultTab: DoctorClientTabId): DoctorClientTabId {
  const anchor = parseHashAnchor();
  if (anchor && DOCTOR_CLIENT_ANCHOR_TO_TAB[anchor]) {
    return DOCTOR_CLIENT_ANCHOR_TO_TAB[anchor];
  }
  return defaultTab;
}

export function useDoctorClientAnchorTab(defaultTab: DoctorClientTabId = "overview") {
  const [activeTab, setActiveTab] = useState<DoctorClientTabId>(() =>
    initialTabFromHash(defaultTab),
  );

  const applyAnchor = useCallback((anchorId: string, options?: { replaceHash?: boolean }) => {
    const tab = DOCTOR_CLIENT_ANCHOR_TO_TAB[anchorId];
    if (tab) setActiveTab(tab);
    if (options?.replaceHash !== false) {
      window.history.replaceState(null, "", `#${anchorId}`);
    }
    scrollToAnchor(anchorId);
  }, []);

  useEffect(() => {
    const anchor = parseHashAnchor();
    if (anchor && DOCTOR_CLIENT_ANCHOR_TO_TAB[anchor]) {
      scrollToAnchor(anchor);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const anchor = parseHashAnchor();
      if (!anchor) return;
      const tab = DOCTOR_CLIENT_ANCHOR_TO_TAB[anchor];
      if (tab) {
        setActiveTab(tab);
        scrollToAnchor(anchor);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigateToTab = useCallback((tab: DoctorClientTabId) => {
    if (DOCTOR_CLIENT_TAB_IDS.includes(tab)) setActiveTab(tab);
  }, []);

  return { activeTab, setActiveTab: navigateToTab, applyAnchor };
}
