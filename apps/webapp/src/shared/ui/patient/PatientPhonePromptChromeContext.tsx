"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type PatientPhonePromptChromeContextValue = {
  suppressPatientHeader: boolean;
  setSuppressPatientHeader: (value: boolean) => void;
};

const PatientPhonePromptChromeContext = createContext<PatientPhonePromptChromeContextValue | null>(null);

export function PatientPhonePromptChromeProvider({ children }: { children: ReactNode }) {
  const [suppressPatientHeader, setSuppressState] = useState(false);
  const setSuppressPatientHeader = useCallback((value: boolean) => {
    setSuppressState(value);
  }, []);
  const value = useMemo(
    () => ({ suppressPatientHeader, setSuppressPatientHeader }),
    [suppressPatientHeader, setSuppressPatientHeader],
  );
  return (
    <PatientPhonePromptChromeContext.Provider value={value}>{children}</PatientPhonePromptChromeContext.Provider>
  );
}

export function usePatientPhonePromptChrome(): PatientPhonePromptChromeContextValue | null {
  return useContext(PatientPhonePromptChromeContext);
}
