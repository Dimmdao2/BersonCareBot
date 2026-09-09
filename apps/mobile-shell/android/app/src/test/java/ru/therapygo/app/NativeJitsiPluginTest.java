package ru.therapygo.app;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
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

        plugin = new NativeJitsiPlugin();
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(plugin, bridge);
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
}
