package ru.therapygo.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mockito;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Exercises {@link UniversalPushPlugin}'s origin gate (kill-set #1/#9) and the private
 * {@code validSurface}/{@code validRoute}/{@code validKind} data-push validators (kill-set #10,
 * MASTER_PLAN M6-09) through reflection, since they are pure string logic with no Android
 * dependency and reflection is far cheaper than fabricating a real
 * {@code UniversalRemoteMessage} through the RuStore SDK for the same assertion (§10a cost rule).
 * Runs once per flavor, so {@code BuildConfig.SHELL_BRAND} is the real value of the variant under
 * test — the cross-brand tests below only have force at all because of that.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = { 33 })
public class UniversalPushPluginTest {

    private UniversalPushPlugin plugin;
    private WebView webView;

    @Before
    public void setUp() throws Exception {
        webView = mock(WebView.class);
        Bridge bridge = mock(Bridge.class);
        when(bridge.getWebView()).thenReturn(webView);

        plugin = new UniversalPushPlugin();
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(plugin, bridge);
    }

    private static boolean invokeValidSurface(String surface) throws Exception {
        Method method = UniversalPushPlugin.class.getDeclaredMethod("validSurface", String.class);
        method.setAccessible(true);
        return (Boolean) method.invoke(null, surface);
    }

    private static boolean invokeValidRoute(String surface, String route) throws Exception {
        Method method = UniversalPushPlugin.class.getDeclaredMethod("validRoute", String.class, String.class);
        method.setAccessible(true);
        return (Boolean) method.invoke(null, surface, route);
    }

    private static boolean invokeValidKind(String kind) throws Exception {
        Method method = UniversalPushPlugin.class.getDeclaredMethod("validKind", String.class);
        method.setAccessible(true);
        return (Boolean) method.invoke(null, kind);
    }

    // Kill: configure() reaches RuStore init/token fetch from an untrusted/foreign current page.
    @Test
    public void configureRejectsWhenOriginUntrusted() {
        when(webView.getUrl()).thenReturn("https://evil.example/");
        PluginCall call = mock(PluginCall.class);

        plugin.configure(call);

        Mockito.verify(call).reject(anyString());
    }

    // Kill: getState()/revoke()/requestPermission() leak token/state or act from an untrusted page.
    @Test
    public void getStateRejectsWhenOriginUntrusted() {
        when(webView.getUrl()).thenReturn(null);
        PluginCall call = mock(PluginCall.class);

        plugin.getState(call);

        Mockito.verify(call).reject(anyString());
    }

    @Test
    public void revokeRejectsWhenOriginUntrusted() {
        when(webView.getUrl()).thenReturn("about:blank");
        PluginCall call = mock(PluginCall.class);

        plugin.revoke(call);

        Mockito.verify(call).reject(anyString());
    }

    @Test
    public void requestPermissionRejectsWhenOriginUntrusted() {
        String siblingOrigin = "therapygo".equals(BuildConfig.SHELL_BRAND) ? "https://therapysto.ru/app/doctor" : "https://therapygo.ru/app/patient";
        when(webView.getUrl()).thenReturn(siblingOrigin);
        PluginCall call = mock(PluginCall.class);

        plugin.requestPermission(call);

        Mockito.verify(call).reject(anyString());
    }

    // --- validSurface -------------------------------------------------------------------------

    // Sanity: this build's own compiled brand is a valid data-push surface.
    @Test
    public void acceptsOwnCompiledBrandAsSurface() throws Exception {
        assertTrue(invokeValidSurface(BuildConfig.SHELL_BRAND));
    }

    // Kill (MUST FIX-1, present in the candidate — not injected): a data push declaring the *other*
    // compiled brand's surface validates against this build. `validSurface` only checks membership in
    // {"therapygo","therapysto"}, never against this process's own BuildConfig.SHELL_BRAND, so a push
    // message for the sibling app is accepted, notified and tap-routed by this app.
    @Test
    public void rejectsTheSiblingBrandAsSurface() throws Exception {
        String otherBrand = "therapygo".equals(BuildConfig.SHELL_BRAND) ? "therapysto" : "therapygo";
        assertFalse(
            "a push declaring the sibling compiled brand's surface must not validate for this build's own UniversalPushPlugin",
            invokeValidSurface(otherBrand)
        );
    }

    @Test
    public void rejectsUnknownSurface() throws Exception {
        assertFalse(invokeValidSurface("evil"));
        assertFalse(invokeValidSurface(null));
        assertFalse(invokeValidSurface(""));
    }

    // --- validRoute ----------------------------------------------------------------------------

    private static String ownPrefix() {
        return "therapygo".equals(BuildConfig.SHELL_BRAND) ? "/app/patient" : "/app/doctor";
    }

    private static String otherPrefix() {
        return "therapygo".equals(BuildConfig.SHELL_BRAND) ? "/app/doctor" : "/app/patient";
    }

    @Test
    public void acceptsExactOwnPrefixRoute() throws Exception {
        assertTrue(invokeValidRoute(BuildConfig.SHELL_BRAND, ownPrefix() + "/settings"));
    }

    @Test
    public void rejectsForeignSurfacePrefixRoute() throws Exception {
        assertFalse(invokeValidRoute(BuildConfig.SHELL_BRAND, otherPrefix() + "/settings"));
    }

    // Kill (MUST FIX-2, present in the candidate — not injected): a route containing `..` that
    // normalizes outside the allowed surface prefix passes both the character-class regex and the
    // literal `startsWith(prefix)` check, because the regex admits `.` and `/` and the prefix check is
    // purely textual, not path-normalized. Resolved as a URL path against the app's own origin this
    // reaches the sibling surface's route space.
    @Test
    public void rejectsPathTraversalOutOfTheAllowedPrefix() throws Exception {
        String traversal = ownPrefix() + "/../.." + otherPrefix() + "/secret";
        assertFalse(
            "a route using .. to normalize out of the allowed surface prefix must be rejected",
            invokeValidRoute(BuildConfig.SHELL_BRAND, traversal)
        );
    }

    @Test
    public void rejectsProtocolRelativeRoute() throws Exception {
        assertFalse(invokeValidRoute(BuildConfig.SHELL_BRAND, "//evil.example/x"));
    }

    @Test
    public void rejectsAbsoluteUrlRoute() throws Exception {
        assertFalse(invokeValidRoute(BuildConfig.SHELL_BRAND, "https://evil.example/x"));
    }

    @Test
    public void rejectsRouteWithoutLeadingSlash() throws Exception {
        assertFalse(invokeValidRoute(BuildConfig.SHELL_BRAND, "app/patient/x"));
    }

    @Test
    public void rejectsOversizedRoute() throws Exception {
        StringBuilder route = new StringBuilder(ownPrefix());
        while (route.length() <= 256) route.append('a');
        assertFalse(invokeValidRoute(BuildConfig.SHELL_BRAND, route.toString()));
    }

    @Test
    public void rejectsNullRoute() throws Exception {
        assertFalse(invokeValidRoute(BuildConfig.SHELL_BRAND, null));
    }

    // --- validKind -----------------------------------------------------------------------------

    @Test
    public void acceptsOnlyTheThreeDocumentedKinds() throws Exception {
        assertTrue(invokeValidKind("message"));
        assertTrue(invokeValidKind("reminder"));
        assertTrue(invokeValidKind("call"));
        assertFalse(invokeValidKind("marketing"));
        assertFalse(invokeValidKind(null));
    }
}
