'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type DoctorShellChrome = {
  title: string;
  backHref?: string;
  backLabel?: string;
};

type Registration = DoctorShellChrome & { token: symbol };

type DoctorShellChromeContextValue = {
  chrome: DoctorShellChrome | null;
  register: (chrome: DoctorShellChrome, token: symbol) => () => void;
};

const DoctorShellChromeContext = createContext<DoctorShellChromeContextValue | null>(null);

export function DoctorShellChromeProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const register = useCallback((chrome: DoctorShellChrome, token: symbol) => {
    setRegistration({ ...chrome, token });
    return () => {
      setRegistration((current) => (current?.token === token ? null : current));
    };
  }, []);
  const value = useMemo(() => ({ chrome: registration, register }), [register, registration]);
  return (
    <DoctorShellChromeContext.Provider value={value}>{children}</DoctorShellChromeContext.Provider>
  );
}

export function DoctorShellChromeRegistration({ title, backHref, backLabel }: DoctorShellChrome) {
  const context = useContext(DoctorShellChromeContext);
  const register = context?.register;
  const tokenRef = useRef(Symbol('doctor-shell-chrome'));
  useEffect(() => {
    if (!register) return;
    return register({ title, backHref, backLabel }, tokenRef.current);
  }, [backHref, backLabel, register, title]);
  return null;
}

export function useDoctorShellChrome(): DoctorShellChrome | null {
  return useContext(DoctorShellChromeContext)?.chrome ?? null;
}
