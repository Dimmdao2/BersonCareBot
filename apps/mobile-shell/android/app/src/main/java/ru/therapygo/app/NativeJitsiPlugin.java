package ru.therapygo.app;

import android.Manifest;
import android.content.Intent;
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
import java.util.UUID;
import org.jitsi.meet.sdk.BroadcastEvent;
import org.jitsi.meet.sdk.BroadcastIntentHelper;
import org.jitsi.meet.sdk.JitsiMeetActivity;
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
    private boolean conferenceActive;
    private String conferenceId;
    private String conferenceUrl;
    private String previousConferenceId;
    private String previousConferenceUrl;

    private final android.content.BroadcastReceiver conferenceReceiver = new android.content.BroadcastReceiver() {
        @Override
        public void onReceive(android.content.Context context, Intent intent) {
            BroadcastEvent event = new BroadcastEvent(intent);
            BroadcastEvent.Type type = event.getType();
            String eventConferenceId = conferenceIdFor(event);
            // SDK broadcasts are process-wide. A room URL is the only source identity they carry,
            // so never relabel an old Activity's event with the replacement launch's identifier.
            if (conferenceId != null && !conferenceId.equals(eventConferenceId)) return;
            if (type == BroadcastEvent.Type.CONFERENCE_JOINED) {
                terminal = false;
                emit("joined", null, eventConferenceId);
            } else if (type == BroadcastEvent.Type.CONFERENCE_TERMINATED || type == BroadcastEvent.Type.READY_TO_CLOSE) {
                conferenceActive = false;
                if (terminalEmitted) return;
                terminalEmitted = true;
                terminal = true;
                String error = conferenceError(event);
                if (error != null) {
                    emit("error", error, eventConferenceId);
                } else {
                    emit("terminated", null, eventConferenceId);
                }
            }
        }
    };

    @Override
    public void load() {
        android.content.IntentFilter filter = new android.content.IntentFilter();
        filter.addAction(BroadcastEvent.Type.CONFERENCE_JOINED.getAction());
        filter.addAction(BroadcastEvent.Type.CONFERENCE_TERMINATED.getAction());
        filter.addAction(BroadcastEvent.Type.READY_TO_CLOSE.getAction());
        LocalBroadcastManager.getInstance(getContext()).registerReceiver(conferenceReceiver, filter);
    }

    @Override
    protected void handleOnDestroy() {
        LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(conferenceReceiver);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!isTrusted(call)) return;
        JitsiSession session = validatedSession(call);
        if (session == null) return;
        retrySession = session;
        if (getPermissionState("camera") != PermissionState.GRANTED
            || getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "onCallPermissions");
            return;
        }
        launch(call, session);
    }

    @PermissionCallback
    private void onCallPermissions(PluginCall call) {
        if (!isTrusted(call)) return;
        if (getPermissionState("camera") != PermissionState.GRANTED
            || getPermissionState("microphone") != PermissionState.GRANTED) {
            emit("error", "permission_denied");
            call.resolve(outcome("permission_denied"));
            return;
        }
        JitsiSession session = validatedSession(call);
        if (session != null) launch(call, session);
    }

    @PluginMethod
    public void hangup(PluginCall call) {
        if (!isTrusted(call)) return;
        // Idempotent: only send the hang-up broadcast while this plugin owns an active conference, so
        // a repeated/late hangup() call is a no-op instead of a stray broadcast with nothing to hear it.
        if (conferenceActive) {
            LocalBroadcastManager.getInstance(getContext()).sendBroadcast(BroadcastIntentHelper.buildHangUpIntent());
        }
        call.resolve(outcome("requested"));
    }

    @PluginMethod
    public void retry(PluginCall call) {
        if (!isTrusted(call)) return;
        if (!terminal || retrySession == null) {
            call.reject("No terminal native conference is available to retry");
            return;
        }
        if (getPermissionState("camera") != PermissionState.GRANTED
            || getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "onRetryPermissions");
            return;
        }
        launch(call, retrySession);
    }

    @PermissionCallback
    private void onRetryPermissions(PluginCall call) {
        if (!isTrusted(call)) return;
        if (getPermissionState("camera") != PermissionState.GRANTED
            || getPermissionState("microphone") != PermissionState.GRANTED) {
            emit("error", "permission_denied");
            call.resolve(outcome("permission_denied"));
            return;
        }
        if (!terminal || retrySession == null) {
            call.reject("No terminal native conference is available to retry");
            return;
        }
        launch(call, retrySession);
    }

    private void launch(PluginCall call, JitsiSession session) {
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
            conferenceActive = true;
            previousConferenceId = conferenceId;
            previousConferenceUrl = conferenceUrl;
            conferenceId = UUID.randomUUID().toString();
            conferenceUrl = conferenceUrl(session);
            JitsiMeetActivity.launch(getContext(), options);
            call.resolve(outcome("started"));
        } catch (Exception ignored) {
            terminal = true;
            terminalEmitted = true;
            conferenceActive = false;
            emit("error", "launch_failed");
            call.resolve(outcome("launch_failed"));
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

    private boolean isTrusted(PluginCall call) {
        if (TrustedOriginGate.isTrusted(getBridge().getWebView())) return true;
        call.reject("Unavailable from this page");
        return false;
    }

    private void emit(String state, String code) {
        emit(state, code, conferenceId);
    }

    private void emit(String state, String code, String eventConferenceId) {
        JSObject event = outcome(state);
        if (code != null) event.put("code", code);
        if (eventConferenceId != null) event.put("conferenceId", eventConferenceId);
        notifyListeners("conference", event);
    }

    private String conferenceIdFor(BroadcastEvent event) {
        Object value = event.getData().get("url");
        if (!(value instanceof String)) return null;
        String eventUrl = conferenceUrl((String) value);
        if (eventUrl.equals(conferenceUrl)) return conferenceId;
        if (eventUrl.equals(previousConferenceUrl)) return previousConferenceId;
        return null;
    }

    private static String conferenceUrl(JitsiSession session) {
        return conferenceUrl(session.endpoint + "/" + session.roomReference);
    }

    private static String conferenceUrl(String value) {
        try {
            URL url = new URL(value);
            String path = url.getPath().replaceAll("/+$", "");
            return url.getProtocol() + "://" + url.getHost() + path;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String conferenceError(BroadcastEvent event) {
        Object value = event.getData().get("error");
        if (!(value instanceof String)) return null;
        String code = (String) value;
        return code.matches("[A-Za-z0-9._-]{1,80}") ? code : "conference_error";
    }

    private JSObject outcome(String state) {
        JSObject value = new JSObject();
        value.put("state", state);
        if (conferenceId != null) value.put("conferenceId", conferenceId);
        return value;
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
