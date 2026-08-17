import type { ClientEnvironmentTelemetry } from './supportedClientMatrix';

export const CLIENT_BOOT_FALLBACK_ID = 'bc-unsupported-client-fallback';
export const CLIENT_BOOT_ACTIVE_CONTENT_ID = 'bc-app-entry-active-content';
export const CLIENT_BOOT_WATCHDOG_MS = 10_000;

export type ClientBootWatchdogStage = 'module_executed' | 'react_mounted';

export type ClientBootWatchdogContract = Readonly<{
  ok(stage: ClientBootWatchdogStage): void;
}>;

declare global {
  interface Window {
    __bcBootWatch?: ClientBootWatchdogContract;
  }
}

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Returns a classic, ES5-syntax watchdog. The string intentionally has no imports,
 * module syntax or dependency on the application bundle.
 */
export function buildClientBootWatchdogScript(input: {
  entrySurface: 'tg' | 'max' | 'browser';
  client: ClientEnvironmentTelemetry;
  /**
   * A development compiler can keep the client module pending for an unbounded time.
   * Only production may classify a missing acknowledgement by elapsed time alone.
   */
  failureTimeoutEnabled: boolean;
  timeoutMs?: number;
}): string {
  const config = safeInlineJson({
    endpoint: '/api/patient-app/client-boot-report',
    fallbackId: CLIENT_BOOT_FALLBACK_ID,
    activeContentId: CLIENT_BOOT_ACTIVE_CONTENT_ID,
    entrySurface: input.entrySurface,
    client: input.client,
    timeoutMs: input.failureTimeoutEnabled ? (input.timeoutMs ?? CLIENT_BOOT_WATCHDOG_MS) : null,
  });

  return `(function(){
var w=window,d=document,cfg=${config},started=Date.now(),timer=null,done=false,moduleExecuted=false,reactMounted=false,capturedError='none';
function removeListeners(){if(w.removeEventListener){w.removeEventListener('error',onError,true);w.removeEventListener('unhandledrejection',onRejection);}}
function ok(stage){if(stage==='module_executed'){moduleExecuted=true;return;}if(stage==='react_mounted'){moduleExecuted=true;reactMounted=true;done=true;if(timer!==null){w.clearTimeout(timer);}var fallback=d.getElementById(cfg.fallbackId);var active=d.getElementById(cfg.activeContentId);if(fallback){fallback.hidden=true;fallback.setAttribute('hidden','');}if(active){active.hidden=false;active.removeAttribute('hidden');}removeListeners();}}
function onError(event){if(done){return;}var target=event&&event.target;var message=event&&typeof event.message==='string'?event.message:'';var errorName=event&&event.error&&typeof event.error.name==='string'?event.error.name:'';if(target&&String(target.tagName||'').toUpperCase()==='SCRIPT'){capturedError='script_load_error';}else if(errorName==='SyntaxError'||message.indexOf('SyntaxError')!==-1){capturedError='syntax_error';}else{capturedError='runtime_error';}}
function onRejection(){if(!done){capturedError='unhandled_rejection';}}
function correlationId(){if(w.crypto&&typeof w.crypto.randomUUID==='function'){return w.crypto.randomUUID();}return 'bc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12)+'-'+Math.random().toString(36).slice(2,12);}
function surface(){if(cfg.entrySurface!=='browser'){return cfg.entrySurface;}try{if(w.matchMedia&&w.matchMedia('(display-mode: standalone)').matches){return 'pwa';}}catch(ignore){}return 'browser';}
function send(payload){if(done){return;}done=true;removeListeners();try{var xhr=new XMLHttpRequest();xhr.open('POST',cfg.endpoint,true);xhr.setRequestHeader('content-type','application/json');xhr.send(JSON.stringify(payload));}catch(ignore){}}
function fail(){if(done||reactMounted){return;}var fallback=d.getElementById(cfg.fallbackId);var active=d.getElementById(cfg.activeContentId);if(fallback){fallback.hidden=false;fallback.removeAttribute('hidden');}if(active){active.hidden=true;active.setAttribute('hidden','');}
var swState='unsupported',storageBucket='unsupported',pending=0,settled=false;
var probes={fetch:typeof w.fetch==='function',promise:typeof w.Promise==='function',serviceWorker:Boolean(navigator.serviceWorker),storageEstimate:Boolean(navigator.storage&&typeof navigator.storage.estimate==='function')};
if(navigator.serviceWorker){swState=navigator.serviceWorker.controller?'controlled':'available';if(typeof navigator.serviceWorker.getRegistration==='function'&&w.Promise){pending+=1;try{navigator.serviceWorker.getRegistration().then(function(registration){swState=registration?'registered':swState;pending-=1;finish();},function(){swState='registration_failed';pending-=1;finish();});}catch(ignore){swState='registration_failed';pending-=1;}}}
if(navigator.storage&&typeof navigator.storage.estimate==='function'&&w.Promise){storageBucket='unknown';pending+=1;try{navigator.storage.estimate().then(function(estimate){var quota=Number(estimate&&estimate.quota)||0;var usage=Number(estimate&&estimate.usage)||0;storageBucket=quota>0&&((usage/quota)>=0.95||(quota-usage)<52428800)?'near_quota':'available';pending-=1;finish();},function(){storageBucket='unavailable';pending-=1;finish();});}catch(ignore){storageBucket='unavailable';pending-=1;}}
var payload={entrySurface:surface(),correlationId:correlationId(),timingMs:Math.min(60000,Math.max(0,Date.now()-started)),client:cfg.client,failureSignals:{moduleExecuted:moduleExecuted,reactMounted:reactMounted,failureKind:moduleExecuted?'module_executed_not_mounted':'module_never_executed',capturedError:capturedError,swState:swState,storageBucket:storageBucket,featureProbes:probes}};
function finish(){payload.failureSignals.swState=swState;payload.failureSignals.storageBucket=storageBucket;if(!settled&&pending===0){settled=true;send(payload);}}
w.setTimeout(function(){if(!settled){settled=true;payload.failureSignals.swState=swState;payload.failureSignals.storageBucket=storageBucket;send(payload);}},500);finish();}
w.__bcBootWatch={ok:ok};if(w.addEventListener){w.addEventListener('error',onError,true);w.addEventListener('unhandledrejection',onRejection);}if(cfg.timeoutMs!==null){timer=w.setTimeout(fail,cfg.timeoutMs);}
}());`;
}

/** Earliest safe acknowledgement from a client-module evaluation. */
export function markClientBootModuleExecuted(): void {
  if (typeof window !== 'undefined') window.__bcBootWatch?.ok('module_executed');
}

export function markClientBootReactMounted(): void {
  if (typeof window !== 'undefined') window.__bcBootWatch?.ok('react_mounted');
}
