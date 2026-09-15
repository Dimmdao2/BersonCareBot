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
  mobileActions?: ReactNode;
  mobileBottomTabs?: ReactNode;
  /**
   * Third mobile chrome row above `mobileBottomTabs`: subsection navigation of the
   * currently open section. Bottom-up order stays global nav → section tabs → subsections.
   */
  mobileSubsectionTabs?: ReactNode;
};

type Registration = DoctorShellChrome & { token: symbol };
type MobileBottomTabsRegistration = { content: ReactNode; token: symbol };

type DoctorShellChromeContextValue = {
  chrome: DoctorShellChrome | null;
  /**
   * Страница попросила свернуть левое меню в полоску и на десктопе. Нужна страницам, которые сами
   * и есть рабочая поверхность во весь экран, — сейчас это видеовстреча (владелец 15.09.2026:
   * «меню на десктопе при этом сворачиваем в полоску как на планшете»). Держится счётчиком
   * регистраций, а не булевым флагом: две страницы в переходе между маршрутами живут одновременно,
   * и размонтирование старой не должно снимать просьбу новой.
   */
  desktopRail: boolean;
  registerDesktopRail: (token: symbol) => () => void;
  register: (chrome: DoctorShellChrome, token: symbol) => () => void;
  registerMobileBottomTabs: (content: ReactNode, token: symbol) => () => void;
  registerMobileSubsectionTabs: (content: ReactNode, token: symbol) => () => void;
};

const DoctorShellChromeContext = createContext<DoctorShellChromeContextValue | null>(null);

export function DoctorShellChromeProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [desktopRailTokens, setDesktopRailTokens] = useState<symbol[]>([]);
  const registerDesktopRail = useCallback((token: symbol) => {
    setDesktopRailTokens((tokens) => (tokens.includes(token) ? tokens : [...tokens, token]));
    return () => {
      setDesktopRailTokens((tokens) => tokens.filter((current) => current !== token));
    };
  }, []);
  const [mobileBottomTabsRegistration, setMobileBottomTabsRegistration] =
    useState<MobileBottomTabsRegistration | null>(null);
  const [mobileSubsectionTabsRegistration, setMobileSubsectionTabsRegistration] =
    useState<MobileBottomTabsRegistration | null>(null);
  const register = useCallback((chrome: DoctorShellChrome, token: symbol) => {
    setRegistration({ ...chrome, token });
    return () => {
      setRegistration((current) => (current?.token === token ? null : current));
    };
  }, []);
  const registerMobileBottomTabs = useCallback((content: ReactNode, token: symbol) => {
    setMobileBottomTabsRegistration({ content, token });
    return () => {
      setMobileBottomTabsRegistration((current) => (current?.token === token ? null : current));
    };
  }, []);
  const registerMobileSubsectionTabs = useCallback((content: ReactNode, token: symbol) => {
    setMobileSubsectionTabsRegistration({ content, token });
    return () => {
      setMobileSubsectionTabsRegistration((current) => (current?.token === token ? null : current));
    };
  }, []);
  const chrome = useMemo(
    () =>
      registration
        ? {
            ...registration,
            mobileBottomTabs:
              mobileBottomTabsRegistration?.content ?? registration.mobileBottomTabs,
            mobileSubsectionTabs:
              mobileSubsectionTabsRegistration?.content ?? registration.mobileSubsectionTabs,
          }
        : null,
    [mobileBottomTabsRegistration, mobileSubsectionTabsRegistration, registration],
  );
  const value = useMemo(
    () => ({
      chrome,
      register,
      registerMobileBottomTabs,
      registerMobileSubsectionTabs,
      desktopRail: desktopRailTokens.length > 0,
      registerDesktopRail,
    }),
    [
      chrome,
      desktopRailTokens,
      register,
      registerDesktopRail,
      registerMobileBottomTabs,
      registerMobileSubsectionTabs,
    ],
  );
  return (
    <DoctorShellChromeContext.Provider value={value}>{children}</DoctorShellChromeContext.Provider>
  );
}

export function DoctorShellMobileBottomTabsRegistration({ content }: { content: ReactNode }) {
  const context = useContext(DoctorShellChromeContext);
  const registerMobileBottomTabs = context?.registerMobileBottomTabs;
  const tokenRef = useRef(Symbol('doctor-shell-mobile-bottom-tabs'));
  useEffect(() => {
    if (!registerMobileBottomTabs) return;
    return registerMobileBottomTabs(content, tokenRef.current);
  }, [content, registerMobileBottomTabs]);
  return null;
}

export function DoctorShellMobileSubsectionTabsRegistration({ content }: { content: ReactNode }) {
  const context = useContext(DoctorShellChromeContext);
  const registerMobileSubsectionTabs = context?.registerMobileSubsectionTabs;
  const tokenRef = useRef(Symbol('doctor-shell-mobile-subsection-tabs'));
  useEffect(() => {
    if (!registerMobileSubsectionTabs) return;
    return registerMobileSubsectionTabs(content, tokenRef.current);
  }, [content, registerMobileSubsectionTabs]);
  return null;
}

export function DoctorShellChromeRegistration({
  title,
  backHref,
  backLabel,
  mobileActions,
  mobileBottomTabs,
  mobileSubsectionTabs,
}: DoctorShellChrome) {
  const context = useContext(DoctorShellChromeContext);
  const register = context?.register;
  const tokenRef = useRef(Symbol('doctor-shell-chrome'));
  useEffect(() => {
    if (!register) return;
    return register(
      { title, backHref, backLabel, mobileActions, mobileBottomTabs, mobileSubsectionTabs },
      tokenRef.current,
    );
  }, [backHref, backLabel, mobileActions, mobileBottomTabs, mobileSubsectionTabs, register, title]);
  return null;
}

export function useDoctorShellChrome(): DoctorShellChrome | null {
  return useContext(DoctorShellChromeContext)?.chrome ?? null;
}

/**
 * Пока страница смонтирована, левое меню оболочки свёрнуто в полоску и на десктопе.
 * Ставится страницей-поверхностью (видеовстреча), снимается автоматически при уходе с неё.
 */
export function DoctorShellDesktopRailRegistration() {
  const context = useContext(DoctorShellChromeContext);
  const registerDesktopRail = context?.registerDesktopRail;
  const tokenRef = useRef(Symbol('doctor-shell-desktop-rail'));
  useEffect(() => {
    if (!registerDesktopRail) return;
    return registerDesktopRail(tokenRef.current);
  }, [registerDesktopRail]);
  return null;
}

export function useDoctorShellDesktopRail(): boolean {
  return useContext(DoctorShellChromeContext)?.desktopRail ?? false;
}
