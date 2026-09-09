package ru.therapygo.app;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.content.Intent;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import androidx.test.core.app.ApplicationProvider;
import java.lang.reflect.Field;
import org.jitsi.meet.sdk.BroadcastEvent;
import org.jitsi.meet.sdk.BroadcastIntentHelper;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Exercises {@link NativeJitsiPlugin#start}/{@code hangup}/{@code retry} through the real
 * {@link TrustedOriginGate} and the real endpoint/room/token validator, without ever reaching
 * {@code JitsiMeetActivity.launch} (kill-set #1/#2 — MASTER_PLAN M4-02/M4-03). Runs once per flavor.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class NativeJitsiPluginTest {

    private NativeJitsiPlugin plugin;
    private WebView webView;

    @Before
    public void setUp() throws Exception {
        webView = mock(WebView.class);
        Bridge bridge = mock(Bridge.class);
        when(bridge.getWebView()).thenReturn(webView);
        when(bridge.getContext()).thenReturn(ApplicationProvider.getApplicationContext());

        plugin = new NativeJitsiPlugin();
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(plugin, bridge);
    }

    // Delivers a synthetic Jitsi SDK broadcast straight to the plugin's own receiver, bypassing
    // LocalBroadcastManager delivery entirely (load()/registerReceiver() is never called by these
    // reflection-based unit tests, matching the rest of this file's pattern of exercising the real
    // validator/gate code without starting the SDK).
    private void deliverConferenceBroadcast(BroadcastEvent.Type type, String errorCode) throws Exception {
        Intent intent = new Intent(type.getAction());
        // BroadcastEvent#getData() is null (not an empty map) when the intent carries no extras at
        // all, and the production conferenceError() dereferences it unconditionally; the real SDK
        // always attaches an extras bundle, so this harmless marker extra reproduces that shape for
        // the no-error path instead of exercising a null-extras case the SDK itself never produces.
        intent.putExtra(errorCode != null ? "error" : "_probe", errorCode != null ? errorCode : "1");
        Field receiverField = NativeJitsiPlugin.class.getDeclaredField("conferenceReceiver");
        receiverField.setAccessible(true);
        android.content.BroadcastReceiver receiver = (android.content.BroadcastReceiver) receiverField.get(plugin);
        receiver.onReceive(ApplicationProvider.getApplicationContext(), intent);
    }

    private PluginCall registerConferenceListener() {
        PluginCall listenerCall = mock(PluginCall.class);
        when(listenerCall.getString("eventName")).thenReturn("conference");
        plugin.addListener(listenerCall);
        return listenerCall;
    }

    private PluginCall validSessionCall() {
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn(ShellVariant.jitsiEndpoint());
        when(call.getString(eq("roomReference"), anyString())).thenReturn("room-123");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("token-abc");
        return call;
    }

    // Kill: an untrusted/foreign current page can still start a native conference.
    @Test
    public void startRejectsWhenOriginUntrusted() {
        when(webView.getUrl()).thenReturn("https://evil.example/");
        PluginCall call = validSessionCall();

        plugin.start(call);

        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    // Kill: the sibling brand's own trusted origin is accepted by this build (cross-brand TrustedOriginGate bypass).
    @Test
    public void startRejectsSiblingBrandOrigin() {
        String siblingOrigin = "therapygo".equals(BuildConfig.SHELL_BRAND) ? "https://therapysto.ru/app/doctor" : "https://therapygo.ru/app/patient";
        when(webView.getUrl()).thenReturn(siblingOrigin);
        PluginCall call = validSessionCall();

        plugin.start(call);

        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    // Kill: hangup dispatches from a page that never passed TrustedOriginGate.
    @Test
    public void hangupRejectsWhenOriginUntrusted() {
        when(webView.getUrl()).thenReturn(null);
        PluginCall call = mock(PluginCall.class);

        plugin.hangup(call);

        verify(call).reject(anyString());
    }

    // Kill: retry dispatches from a page that never passed TrustedOriginGate.
    @Test
    public void retryRejectsWhenOriginUntrusted() {
        when(webView.getUrl()).thenReturn("about:blank");
        PluginCall call = mock(PluginCall.class);

        plugin.retry(call);

        verify(call).reject(anyString());
    }

    // Kill: retry launches without ever having a prior joined/terminated session (nothing to retry).
    @Test
    public void retryRejectsWithoutAnyPriorTerminalSession() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);

        plugin.retry(call);

        verify(call).reject(anyString());
    }

    // Kill: a non-exact Jitsi endpoint (subdomain/suffix trick) reaches the SDK.
    @Test
    public void rejectsEndpointSubdomainTrick() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn(ShellVariant.jitsiEndpoint().replace("https://", "https://evil."));
        when(call.getString(eq("roomReference"), anyString())).thenReturn("room-123");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("token-abc");

        plugin.start(call);

        verify(call).reject("Invalid native conference session");
        verify(call, never()).resolve(any(JSObject.class));
    }

    // Kill: a non-default port on the otherwise-correct Jitsi host reaches the SDK.
    @Test
    public void rejectsEndpointWithNonDefaultPort() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn(ShellVariant.jitsiEndpoint() + ":8443");
        when(call.getString(eq("roomReference"), anyString())).thenReturn("room-123");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("token-abc");

        plugin.start(call);

        verify(call).reject("Invalid native conference session");
    }

    // Kill: cleartext to the same host reaches the SDK.
    @Test
    public void rejectsCleartextEndpoint() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn(ShellVariant.jitsiEndpoint().replace("https://", "http://"));
        when(call.getString(eq("roomReference"), anyString())).thenReturn("room-123");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("token-abc");

        plugin.start(call);

        verify(call).reject("Invalid native conference session");
    }

    // Kill: the sibling brand's own Jitsi endpoint (meet.jit.si-equivalent cross-environment/JaaS-style) validates.
    @Test
    public void rejectsUnrelatedJitsiHost() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn("https://meet.jit.si");
        when(call.getString(eq("roomReference"), anyString())).thenReturn("room-123");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("token-abc");

        plugin.start(call);

        verify(call).reject("Invalid native conference session");
    }

    // Kill: a JaaS-style endpoint with a tenant path prefix validates.
    @Test
    public void rejectsJaasStyleEndpoint() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn("https://8x8.vc/some-tenant");
        when(call.getString(eq("roomReference"), anyString())).thenReturn("room-123");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("token-abc");

        plugin.start(call);

        verify(call).reject("Invalid native conference session");
    }

    // Kill: a malformed/non-opaque room reference (e.g. containing a path separator or leading punctuation) validates.
    @Test
    public void rejectsMalformedRoomReference() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn(ShellVariant.jitsiEndpoint());
        when(call.getString(eq("roomReference"), anyString())).thenReturn("../etc/passwd");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("token-abc");

        plugin.start(call);

        verify(call).reject("Invalid native conference session");
    }

    // Kill: a blank access token validates (unauthenticated join).
    @Test
    public void rejectsBlankAccessToken() {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);
        when(call.getString(eq("endpoint"), anyString())).thenReturn(ShellVariant.jitsiEndpoint());
        when(call.getString(eq("roomReference"), anyString())).thenReturn("room-123");
        when(call.getString(eq("accessToken"), anyString())).thenReturn("");

        plugin.start(call);

        verify(call).reject("Invalid native conference session");
    }

    // --- terminal-event dedup / hangup idempotency (confirmation audit) ------------------------

    // Kill (brief item 3, terminal dedup): CONFERENCE_TERMINATED and READY_TO_CLOSE are two SDK
    // signals for the same one ended conference; both firing must still emit exactly one terminal
    // "conference" event, not two.
    @Test
    public void bothTerminationBroadcastsForOneConferenceEmitExactlyOneTerminalEvent() throws Exception {
        PluginCall listener = registerConferenceListener();

        deliverConferenceBroadcast(BroadcastEvent.Type.CONFERENCE_TERMINATED, null);
        deliverConferenceBroadcast(BroadcastEvent.Type.READY_TO_CLOSE, null);

        org.mockito.ArgumentCaptor<JSObject> captor = org.mockito.ArgumentCaptor.forClass(JSObject.class);
        verify(listener, org.mockito.Mockito.times(1)).resolve(captor.capture());
        assertEquals("terminated", captor.getValue().getString("state"));
    }

    // Kill: a duplicate CONFERENCE_TERMINATED (SDK redelivery) emits a second terminal event.
    @Test
    public void duplicateConferenceTerminatedEmitsExactlyOneTerminalEvent() throws Exception {
        PluginCall listener = registerConferenceListener();

        deliverConferenceBroadcast(BroadcastEvent.Type.CONFERENCE_TERMINATED, null);
        deliverConferenceBroadcast(BroadcastEvent.Type.CONFERENCE_TERMINATED, null);

        verify(listener, org.mockito.Mockito.times(1)).resolve(any(JSObject.class));
    }

    // Kill (brief item 3, error priority): an error signal followed by a duplicate close/terminate
    // signal for the same launch must not overwrite/duplicate the already-emitted terminal event.
    @Test
    public void errorTerminalEventIsNotFollowedByASecondTerminatedEvent() throws Exception {
        PluginCall listener = registerConferenceListener();

        deliverConferenceBroadcast(BroadcastEvent.Type.CONFERENCE_TERMINATED, "conference.connectionError.membersOnly");
        deliverConferenceBroadcast(BroadcastEvent.Type.READY_TO_CLOSE, null);

        org.mockito.ArgumentCaptor<JSObject> captor = org.mockito.ArgumentCaptor.forClass(JSObject.class);
        verify(listener, org.mockito.Mockito.times(1)).resolve(captor.capture());
        assertEquals("error", captor.getValue().getString("state"));
    }

    // Kill (continuation brief item 1): once room A has been destroyed and room B is the
    // current launch, a late terminal broadcast from A must not be relabelled as B and end B's
    // web stage. The SDK broadcast has no conference id of its own, so this is the exact silent
    // ownership loss the lifecycle handoff must prevent.
    @Test
    public void latePriorConferenceTerminationCannotBeEmittedAsTheReplacementLaunch() throws Exception {
        PluginCall listener = registerConferenceListener();
        Field conferenceIdField = NativeJitsiPlugin.class.getDeclaredField("conferenceId");
        conferenceIdField.setAccessible(true);
        conferenceIdField.set(plugin, "replacement-launch-0001");

        deliverConferenceBroadcast(BroadcastEvent.Type.CONFERENCE_TERMINATED, null);

        verify(listener, never()).resolve(any(JSObject.class));
    }

    // A fresh CONFERENCE_JOINED still notifies normally (dedup only guards the terminal side).
    @Test
    public void conferenceJoinedStillEmitsNormally() throws Exception {
        PluginCall listener = registerConferenceListener();

        deliverConferenceBroadcast(BroadcastEvent.Type.CONFERENCE_JOINED, null);

        org.mockito.ArgumentCaptor<JSObject> captor = org.mockito.ArgumentCaptor.forClass(JSObject.class);
        verify(listener, org.mockito.Mockito.times(1)).resolve(captor.capture());
        assertEquals("joined", captor.getValue().getString("state"));
    }

    // Kill (brief item 3, hangup idempotency): hangup() sends the SDK hang-up broadcast even when
    // this plugin instance never launched (or already terminated) a conference — a stray broadcast
    // with nothing listening, instead of the documented no-op.
    @Test
    public void hangupIsANoopWithoutAnActiveConference() throws Exception {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        android.content.Context context = ApplicationProvider.getApplicationContext();
        java.util.concurrent.atomic.AtomicInteger hangUpBroadcasts = new java.util.concurrent.atomic.AtomicInteger();
        android.content.BroadcastReceiver testReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(android.content.Context c, Intent intent) {
                hangUpBroadcasts.incrementAndGet();
            }
        };
        String hangUpAction = BroadcastIntentHelper.buildHangUpIntent().getAction();
        androidx.localbroadcastmanager.content.LocalBroadcastManager manager = androidx.localbroadcastmanager.content.LocalBroadcastManager.getInstance(context);
        manager.registerReceiver(testReceiver, new android.content.IntentFilter(hangUpAction));
        try {
            PluginCall call = mock(PluginCall.class);

            plugin.hangup(call);
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();

            assertEquals("hangup() must not broadcast without an active conference", 0, hangUpBroadcasts.get());
            verify(call).resolve(any(JSObject.class));
        } finally {
            manager.unregisterReceiver(testReceiver);
        }
    }

    // Regression: once a conference is actually active (CONFERENCE_JOINED observed), hangup() does
    // send the SDK's real hang-up broadcast exactly once.
    @Test
    public void hangupBroadcastsExactlyOnceWhileAConferenceIsActive() throws Exception {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        android.content.Context context = ApplicationProvider.getApplicationContext();
        java.util.concurrent.atomic.AtomicInteger hangUpBroadcasts = new java.util.concurrent.atomic.AtomicInteger();
        android.content.BroadcastReceiver testReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(android.content.Context c, Intent intent) {
                hangUpBroadcasts.incrementAndGet();
            }
        };
        String hangUpAction = BroadcastIntentHelper.buildHangUpIntent().getAction();
        androidx.localbroadcastmanager.content.LocalBroadcastManager manager = androidx.localbroadcastmanager.content.LocalBroadcastManager.getInstance(context);
        manager.registerReceiver(testReceiver, new android.content.IntentFilter(hangUpAction));
        try {
            // Set conferenceActive without going through launch()/JitsiMeetActivity.launch (real
            // SDK activity start is out of scope for this unit test), the same way start()'s own
            // "launched" bookkeeping is a plain private boolean field.
            Field activeField = NativeJitsiPlugin.class.getDeclaredField("conferenceActive");
            activeField.setAccessible(true);
            activeField.setBoolean(plugin, true);

            PluginCall call = mock(PluginCall.class);
            plugin.hangup(call);
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();

            assertEquals(1, hangUpBroadcasts.get());
        } finally {
            manager.unregisterReceiver(testReceiver);
        }
    }
}
