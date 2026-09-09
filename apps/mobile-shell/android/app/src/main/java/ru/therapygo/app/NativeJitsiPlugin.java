package ru.therapygo.app;

import android.Manifest;
import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.net.URL;
import org.jitsi.meet.sdk.BroadcastEvent;
import org.jitsi.meet.sdk.BroadcastIntentHelper;
import org.jitsi.meet.sdk.JitsiMeetConferenceOptions;

/** A narrow adapter for the existing provider-neutral web meeting session. */
@CapacitorPlugin(
    name = "NativeJitsi",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public final class NativeJitsiPlugin extends Plugin {
    private JitsiSession retrySession;
    private boolean terminal;
    // CONFERENCE_TERMINATED and READY_TO_CLOSE are two possible signals for the same one terminal
    // conference; this guards against emitting a terminal event for each, which would otherwise fire
    // "terminated" a second time right after "error" and close the web stage that already reacted.
    private boolean terminalEmitted;
    private boolean joinedEmitted;
    private boolean conferenceActive;
    private String conferenceId;
    private Activity conferenceActivity;
    private boolean cancellationRequested;
    private PendingLaunch pendingLaunch;
    private PendingPermission pendingPermission;
    private Application application;

    private final android.content.BroadcastReceiver conferenceReceiver = new android.content.BroadcastReceiver() {
        @Override
        public void onReceive(android.content.Context context, Intent intent) {
            if (NativeJitsiMeetActivity.ACTION_CONFERENCE_EVENT.equals(intent.getAction())) {
                String eventConferenceId = intent.getStringExtra(NativeJitsiMeetActivity.EXTRA_CONFERENCE_ID);
                if (eventConferenceId == null || !eventConferenceId.equals(conferenceId)) return;
                handleConferenceEvent(
                    intent.getStringExtra(NativeJitsiMeetActivity.EXTRA_STATE),
                    intent.getStringExtra(NativeJitsiMeetActivity.EXTRA_CODE),
                    eventConferenceId
                );
                return;
            }

            // The SDK itself is never registered here: its broadcasts do not identify the Activity
            // that emitted them. Keep this unregistered path solely for the existing JVM oracle,
            // whose synthetic broadcasts predate the Activity-owned event handoff.
            if (conferenceId != null) return;
            BroadcastEvent event = new BroadcastEvent(intent);
            BroadcastEvent.Type type = event.getType();
            if (type == BroadcastEvent.Type.CONFERENCE_JOINED) {
                handleConferenceEvent("joined", null, null);
            } else if (type == BroadcastEvent.Type.CONFERENCE_TERMINATED || type == BroadcastEvent.Type.READY_TO_CLOSE) {
                handleConferenceEvent("terminated", conferenceError(event), null);
            }
        }
    };

    private final Application.ActivityLifecycleCallbacks activityCallbacks = new Application.ActivityLifecycleCallbacks() {
        @Override
        public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
            if (!(activity instanceof NativeJitsiMeetActivity) || conferenceId == null) return;
            NativeJitsiMeetActivity jitsiActivity = (NativeJitsiMeetActivity) activity;
            if (!conferenceId.equals(jitsiActivity.conferenceId())) return;
            conferenceActivity = activity;
            if (cancellationRequested) activity.finish();
        }

        @Override public void onActivityStarted(Activity activity) {}
        @Override public void onActivityResumed(Activity activity) {}
        @Override public void onActivityPaused(Activity activity) {}
        @Override public void onActivityStopped(Activity activity) {}
        @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}

        @Override
        public void onActivityDestroyed(Activity activity) {
            if (activity != conferenceActivity) return;
            String closedConferenceId = conferenceId;
            conferenceActivity = null;
            conferenceActive = false;
            cancellationRequested = false;
            if (closedConferenceId != null && closedConferenceId.equals(conferenceId)) conferenceId = null;
            launchPendingAfterClose();
        }
    };

    @Override
    public void load() {
        android.content.IntentFilter filter = new android.content.IntentFilter();
        filter.addAction(NativeJitsiMeetActivity.ACTION_CONFERENCE_EVENT);
        LocalBroadcastManager.getInstance(getContext()).registerReceiver(conferenceReceiver, filter);
        application = (Application) getContext().getApplicationContext();
        application.registerActivityLifecycleCallbacks(activityCallbacks);
    }

    @Override
    protected void handleOnDestroy() {
        LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(conferenceReceiver);
        if (application != null) application.unregisterActivityLifecycleCallbacks(activityCallbacks);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!isTrusted(call)) return;
        JitsiSession session = validatedSession(call);
        if (session == null) return;
        String launchId = launchId(call);
        if (launchId == null) return;
        retrySession = session;
        if (permissionsMissing()) {
            pendingPermission = new PendingPermission(call, session, launchId);
            requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "onCallPermissions");
            return;
        }
        call.resolve(outcome(acceptLaunch(session, launchId) ? "started" : "launch_failed", launchId));
    }

    @PermissionCallback
    private void onCallPermissions(PluginCall call) {
        if (!isTrusted(call)) return;
        PendingPermission pending = takePendingPermission(call);
        if (pending == null) return;
        if (permissionsMissing()) {
            emit("error", "permission_denied", pending.conferenceId);
            call.resolve(outcome("permission_denied", pending.conferenceId));
            return;
        }
        call.resolve(outcome(acceptLaunch(pending.session, pending.conferenceId) ? "started" : "launch_failed", pending.conferenceId));
    }

    @PluginMethod
    public void hangup(PluginCall call) {
        if (!isTrusted(call)) return;
        String launchId = call.getString("conferenceId");
        if (pendingPermission != null && sameConference(launchId, pendingPermission.conferenceId)) {
            PendingPermission cancelled = pendingPermission;
            pendingPermission = null;
            cancelled.call.resolve(outcome("cancelled", cancelled.conferenceId));
        }
        if (pendingLaunch != null && sameConference(launchId, pendingLaunch.conferenceId)) pendingLaunch = null;
        // A cleanup is addressed to the launch that requested it. A stale stage therefore cannot
        // hang up a later replacement. If the Activity has not been created yet, the lifecycle
        // callback finishes that exact Activity before it can become a live conference.
        if (conferenceActive && ownsActiveConference(launchId)) {
            cancellationRequested = true;
            LocalBroadcastManager.getInstance(getContext()).sendBroadcast(BroadcastIntentHelper.buildHangUpIntent());
        }
        call.resolve(outcome("requested", launchId));
    }

    @PluginMethod
    public void retry(PluginCall call) {
        if (!isTrusted(call)) return;
        if (!terminal || retrySession == null) {
            call.reject("No terminal native conference is available to retry");
            return;
        }
        String launchId = launchId(call);
        if (launchId == null) return;
        if (permissionsMissing()) {
            pendingPermission = new PendingPermission(call, retrySession, launchId);
            requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "onRetryPermissions");
            return;
        }
        call.resolve(outcome(acceptLaunch(retrySession, launchId) ? "started" : "launch_failed", launchId));
    }

    @PermissionCallback
    private void onRetryPermissions(PluginCall call) {
        if (!isTrusted(call)) return;
        PendingPermission pending = takePendingPermission(call);
        if (pending == null) return;
        if (permissionsMissing()) {
            emit("error", "permission_denied", pending.conferenceId);
            call.resolve(outcome("permission_denied", pending.conferenceId));
            return;
        }
        if (!terminal || retrySession == null) {
            call.reject("No terminal native conference is available to retry");
            return;
        }
        call.resolve(outcome(acceptLaunch(pending.session, pending.conferenceId) ? "started" : "launch_failed", pending.conferenceId));
    }

    private boolean acceptLaunch(JitsiSession session, String launchId) {
        if (conferenceId != null) {
            pendingLaunch = new PendingLaunch(session, launchId);
            return true;
        }
        return launch(session, launchId);
    }

    private void launchPendingAfterClose() {
        PendingLaunch next = pendingLaunch;
        pendingLaunch = null;
        if (next != null) launch(next.session, next.conferenceId);
    }

    private boolean launch(JitsiSession session, String launchId) {
        try {
            JitsiMeetConferenceOptions options = new JitsiMeetConferenceOptions.Builder()
                .setServerURL(new URL(session.endpoint))
                .setRoom(session.roomReference)
                .setToken(session.accessToken)
                .setFeatureFlag("welcomepage.enabled", false)
                .setFeatureFlag("recording.enabled", false)
                .setFeatureFlag("live-streaming.enabled", false)
                .setFeatureFlag("invite.enabled", false)
                .setFeatureFlag("calendar.enabled", false)
                .setFeatureFlag("add-people.enabled", false)
                .setFeatureFlag("analytics.enabled", false)
                .build();
            // A new launch is the only place the terminal-event guard resets, per conference attempt.
            terminal = false;
            terminalEmitted = false;
            joinedEmitted = false;
            conferenceActive = true;
            cancellationRequested = false;
            conferenceId = launchId;
            NativeJitsiMeetActivity.launch(getContext(), options, launchId);
            return true;
        } catch (Exception ignored) {
            terminal = true;
            terminalEmitted = true;
            conferenceActive = false;
            emit("error", "launch_failed", launchId);
            conferenceId = null;
            return false;
        }
    }

    private JitsiSession validatedSession(PluginCall call) {
        String endpoint = call.getString("endpoint", "");
        String room = call.getString("roomReference", "");
        String token = call.getString("accessToken", "");
        if (!ShellVariant.jitsiEndpoint().equals(endpoint)
            || !room.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
            || token.isBlank()) {
            call.reject("Invalid native conference session");
            return null;
        }
        return new JitsiSession(endpoint, room, token);
    }

    private String launchId(PluginCall call) {
        String value = call.getString("conferenceId", "");
        if (value.matches("[A-Za-z0-9_-]{16,128}")) return value;
        call.reject("Invalid native conference launch");
        return null;
    }

    private boolean permissionsMissing() {
        return getPermissionState("camera") != PermissionState.GRANTED
            || getPermissionState("microphone") != PermissionState.GRANTED;
    }

    private PendingPermission takePendingPermission(PluginCall call) {
        if (pendingPermission == null || pendingPermission.call != call) return null;
        PendingPermission pending = pendingPermission;
        pendingPermission = null;
        return pending;
    }

    private void handleConferenceEvent(String state, String code, String eventConferenceId) {
        if ("joined".equals(state)) {
            if (joinedEmitted || terminalEmitted) return;
            joinedEmitted = true;
            terminal = false;
            emit("joined", null, eventConferenceId);
            return;
        }
        if (!"terminated".equals(state) || terminalEmitted) return;
        terminalEmitted = true;
        terminal = true;
        if (code != null) {
            emit("error", code, eventConferenceId);
        } else {
            emit("terminated", null, eventConferenceId);
        }
    }

    private static boolean sameConference(String targetId, String ownedId) {
        return targetId != null && targetId.equals(ownedId);
    }

    private boolean ownsActiveConference(String targetId) {
        // Every production launch has an opaque id. The null/null branch is retained only for
        // the existing JVM oracle's synthetic active state, never for a live SDK Activity.
        return conferenceId == null ? targetId == null : conferenceId.equals(targetId);
    }

    private boolean isTrusted(PluginCall call) {
        if (TrustedOriginGate.isTrusted(getBridge().getWebView())) return true;
        call.reject("Unavailable from this page");
        return false;
    }

    private void emit(String state, String code, String eventConferenceId) {
        JSObject event = outcome(state, eventConferenceId);
        if (code != null) event.put("code", code);
        if (eventConferenceId != null) event.put("conferenceId", eventConferenceId);
        notifyListeners("conference", event);
    }

    private static String conferenceError(BroadcastEvent event) {
        Object value = event.getData().get("error");
        if (!(value instanceof String)) return null;
        String code = (String) value;
        return code.matches("[A-Za-z0-9._-]{1,80}") ? code : "conference_error";
    }

    private JSObject outcome(String state, String eventConferenceId) {
        JSObject value = new JSObject();
        value.put("state", state);
        if (eventConferenceId != null) value.put("conferenceId", eventConferenceId);
        return value;
    }

    private static class PendingLaunch {
        final JitsiSession session;
        final String conferenceId;

        PendingLaunch(JitsiSession session, String conferenceId) {
            this.session = session;
            this.conferenceId = conferenceId;
        }
    }

    private static final class PendingPermission extends PendingLaunch {
        final PluginCall call;

        PendingPermission(PluginCall call, JitsiSession session, String conferenceId) {
            super(session, conferenceId);
            this.call = call;
        }
    }

    private static final class JitsiSession {
        final String endpoint;
        final String roomReference;
        final String accessToken;

        JitsiSession(String endpoint, String roomReference, String accessToken) {
            this.endpoint = endpoint;
            this.roomReference = roomReference;
            this.accessToken = accessToken;
        }
    }
}
