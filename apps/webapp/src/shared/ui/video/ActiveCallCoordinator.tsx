'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { usePlatform } from '@/shared/hooks/usePlatform';
import { VideoMeetingStage } from './VideoMeetingStage';

type MeetingDiagnostic = {
  event: 'join' | 'error' | 'end';
  durationMs?: number;
  transport?: 'p2p' | 'relay';
  errorClass?: 'connection' | 'media' | 'provider';
};

export type ActiveCall = {
  session: VideoMeetingRenderSession;
  /** Exact route, including its query string, used by every return-to-call control. */
  returnUrl: string;
  onTerminal?: () => void;
  onDiagnostic?: (diagnostic: MeetingDiagnostic) => void;
};

type ActiveCallContextValue = {
  activeCall: ActiveCall | null;
  isMobile: boolean;
  isActiveRoute: boolean;
  /** Returns false when a current call already owns the authenticated shell. */
  activate: (call: ActiveCall) => boolean;
  completeFromRenderer: () => void;
  reportDiagnostic: (diagnostic: MeetingDiagnostic) => void;
};

const inactiveActiveCallContext: ActiveCallContextValue = {
  activeCall: null,
  isMobile: false,
  isActiveRoute: false,
  activate: () => true,
  completeFromRenderer: () => {},
  reportDiagnostic: () => {},
};

const ActiveCallContext = createContext<ActiveCallContextValue>(inactiveActiveCallContext);

function routePath(url: string): string {
  return url.split(/[?#]/, 1)[0] || url;
}

/**
 * The one authenticated owner for a mobile call. It remains mounted inside each product shell, so a
 * route transition only changes presentation; it never replaces the browser iframe or native Activity.
 */
export function ActiveCallCoordinator({ children, floatingIndicator }: {
  children: ReactNode;
  floatingIndicator?: ReactNode;
}) {
  const pathname = usePathname();
  const platform = usePlatform();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const terminalRef = useRef(false);
  const isMobile = platform !== 'desktop';
  const isActiveRoute = activeCall !== null && pathname === routePath(activeCall.returnUrl);

  const activate = useCallback((call: ActiveCall): boolean => {
    if (activeRef.current) return false;
    terminalRef.current = false;
    activeRef.current = call;
    setActiveCall(call);
    return true;
  }, []);

  const completeFromRenderer = useCallback(() => {
    const current = activeRef.current;
    if (!current || terminalRef.current) return;
    terminalRef.current = true;
    activeRef.current = null;
    setActiveCall(null);
    current.onTerminal?.();
  }, []);

  const reportDiagnostic = useCallback((diagnostic: MeetingDiagnostic) => {
    activeRef.current?.onDiagnostic?.(diagnostic);
  }, []);

  const value = useMemo<ActiveCallContextValue>(() => ({
    activeCall,
    isMobile,
    isActiveRoute,
    activate,
    completeFromRenderer,
    reportDiagnostic,
  }), [activate, activeCall, completeFromRenderer, isActiveRoute, isMobile, reportDiagnostic]);

  return (
    <ActiveCallContext.Provider value={value}>
      {children}
      {activeCall && isMobile ? (
        <>
          <VideoMeetingStage
            session={activeCall.session}
            onHangup={completeFromRenderer}
            onDiagnostic={reportDiagnostic}
            className={
              isActiveRoute
                ? 'fixed inset-0 z-50 bg-black'
                : 'fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-3 z-40 h-44 w-60 overflow-hidden rounded-lg bg-black shadow-lg'
            }
          />
          {!isActiveRoute ? floatingIndicator : null}
        </>
      ) : null}
    </ActiveCallContext.Provider>
  );
}

export function useActiveCall(): ActiveCallContextValue {
  return useContext(ActiveCallContext);
}
