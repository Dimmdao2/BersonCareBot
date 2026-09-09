package ru.therapygo.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
import org.mockito.ArgumentCaptor;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Exercises the public {@code ShellRuntime.getRuntimeInfo} contract through the real
 * {@link ShellRuntimePlugin}, gated by the real {@link TrustedOriginGate}. Runs once per flavor,
 * so {@code BuildConfig.SHELL_BRAND} is the real value of the variant under test.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class ShellRuntimePluginTest {

    private ShellRuntimePlugin plugin;
    private WebView webView;

    @Before
    public void setUp() throws Exception {
        webView = mock(WebView.class);
        Bridge bridge = mock(Bridge.class);
        when(bridge.getWebView()).thenReturn(webView);

        plugin = new ShellRuntimePlugin();
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(plugin, bridge);
    }

    // Kill: runtime-info resolves (leaks kind/brand/capabilities) while the current page is a foreign origin.
    @Test
    public void rejectsWhenCurrentWebViewUrlIsUntrusted() {
        when(webView.getUrl()).thenReturn("https://evil.example/");
        PluginCall call = mock(PluginCall.class);

        plugin.getRuntimeInfo(call);

        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    // Kill: runtime-info resolves for about:blank (no real page committed yet).
    @Test
    public void rejectsForAboutBlank() {
        when(webView.getUrl()).thenReturn("about:blank");
        PluginCall call = mock(PluginCall.class);

        plugin.getRuntimeInfo(call);

        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    // Kill: runtime-info resolves for a null/missing current URL (e.g. local error page) instead of failing closed.
    @Test
    public void rejectsForNullCurrentUrl() {
        when(webView.getUrl()).thenReturn(null);
        PluginCall call = mock(PluginCall.class);

        plugin.getRuntimeInfo(call);

        verify(call).reject(anyString());
        verify(call, never()).resolve(any(JSObject.class));
    }

    // Kill: resolved payload reports a stale/missing capability, or the wrong brand for this build variant.
    //
    // The expected `true`s below are not this test's own invention: #915 (M4/M5/M6, `fafa7dcf0`) intentionally
    // flips ShellRuntimePlugin's placeholder `false`s to `true` now that NativeJitsi/DeviceMedia/UniversalPush are
    // actually built — see `apps/mobile-shell/README.md` ("ShellRuntime.getRuntimeInfo() reports the three
    // compiled capabilities as true") and `src/runtime-info.ts`'s matching `SHELL_RUNTIME_CAPABILITIES`. Before
    // #915 this test asserted `false` for the same baseline reason (no plugin existed yet); the oracle moves with
    // the owner-approved plan, not with this candidate's implementation.
    @Test
    public void resolvesTrustedOriginWithTrueCapabilitiesAndVariantBrand() throws Exception {
        when(webView.getUrl()).thenReturn(ShellVariant.startUrl());
        PluginCall call = mock(PluginCall.class);

        plugin.getRuntimeInfo(call);

        ArgumentCaptor<JSObject> captor = ArgumentCaptor.forClass(JSObject.class);
        verify(call).resolve(captor.capture());
        verify(call, never()).reject(anyString());

        JSObject result = captor.getValue();
        assertEquals("capacitor-android", result.getString("kind"));
        assertEquals(BuildConfig.SHELL_BRAND, result.getString("brand"));

        JSObject capabilities = result.getJSObject("capabilities");
        assertTrue(capabilities.getBool("jitsi"));
        assertTrue(capabilities.getBool("media"));
        assertTrue(capabilities.getBool("push"));
    }
}
