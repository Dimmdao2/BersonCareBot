package ru.therapygo.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import android.content.Intent;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatActivity;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
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

    private static boolean invokeValidCopy(String title, String body) throws Exception {
        Method method = UniversalPushPlugin.class.getDeclaredMethod("validCopy", String.class, String.class);
        method.setAccessible(true);
        return (Boolean) method.invoke(null, title, body);
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

    // Kill (#915 wire-correction confirmation audit, kill-set K12/K14): Therapysto's staff surface
    // spans three roots server-side (deliveryAdapter.ts:surfaceForPathname —
    // /app/doctor,/app/settings,/app/account). `validRoute` takes `surface` as an explicit
    // parameter, independent of this build's own compiled brand, so both non-doctor prefixes are
    // probed directly rather than only through this run's own flavor.
    @Test
    public void acceptsTherapystoSettingsAndAccountPrefixesNotJustDoctor() throws Exception {
        assertTrue(invokeValidRoute("therapysto", "/app/settings"));
        assertTrue(invokeValidRoute("therapysto", "/app/settings/profile"));
        assertTrue(invokeValidRoute("therapysto", "/app/account"));
        assertTrue(invokeValidRoute("therapysto", "/app/account/security"));
        assertFalse(
            "a lookalike prefix that only shares a string prefix with an allowed root must not validate",
            invokeValidRoute("therapysto", "/app/settingsish")
        );
    }

    // --- validCopy -----------------------------------------------------------------------------

    // Kill (M6-09/M6-10): a data push with missing/blank/overlong title or overlong body must never
    // reach `showNotification` — Android independently enforces the bound rather than trusting the
    // server's own truncation.
    @Test
    public void validCopyRejectsMissingBlankOrOversizedFields() throws Exception {
        assertTrue(invokeValidCopy("Title", "Body"));
        assertTrue("an empty body is allowed (many notifications carry only a title)", invokeValidCopy("Title", ""));
        assertFalse(invokeValidCopy(null, "Body"));
        assertFalse(invokeValidCopy("  ", "Body"));
        assertFalse(invokeValidCopy("Title", null));
        StringBuilder longTitle = new StringBuilder();
        while (longTitle.length() <= 120) longTitle.append('a');
        assertFalse(invokeValidCopy(longTitle.toString(), "Body"));
        StringBuilder longBody = new StringBuilder();
        while (longBody.length() <= 240) longBody.append('a');
        assertFalse(invokeValidCopy("Title", longBody.toString()));
    }

    // Kill: a bound checked in UTF-16 code units instead of Unicode code points would reject a
    // 120-code-point title that contains a surrogate-pair emoji (which is 1 code point / 2 chars),
    // since title.length() would read 121 for it — mirrors the integrator's
    // `truncateCodePoints` contract (deliveryAdapter.ts) so the two never disagree.
    @Test
    public void validCopyCountsUnicodeCodePointsNotChars() throws Exception {
        StringBuilder exactly120CodePoints = new StringBuilder();
        for (int i = 0; i < 119; i++) exactly120CodePoints.append('a');
        exactly120CodePoints.appendCodePoint(0x1F600); // 😀 — one code point, two UTF-16 chars
        assertTrue(
            "a title with exactly 120 code points (one of them a surrogate-pair emoji) must be accepted",
            invokeValidCopy(exactly120CodePoints.toString(), "Body")
        );
    }

    // --- tap event shape -------------------------------------------------------------------------

    // Confirmed by inspection (no test needed — one-time construction, not repeatable behavior,
    // §24.4): `PushRuntime.showNotification` puts `.putExtra("nativePushKind", kind)` on the exact
    // `Intent` that becomes the tap `PendingIntent`'s content intent, alongside
    // `nativePushSurface`/`nativePushRoute` — the same three extras `deliverPendingTap()` below reads
    // back from `getActivity().getIntent()`.

    private static Intent launchIntentWith(String surface, String kind, String route) {
        Intent launchIntent = new Intent();
        if (surface != null) launchIntent.putExtra("nativePushSurface", surface);
        if (kind != null) launchIntent.putExtra("nativePushKind", kind);
        if (route != null) launchIntent.putExtra("nativePushRoute", route);
        return launchIntent;
    }

    private static UniversalPushPlugin pluginWithLaunchIntent(Intent launchIntent) throws Exception {
        AppCompatActivity activity = mock(AppCompatActivity.class);
        when(activity.getIntent()).thenReturn(launchIntent);
        Bridge tapBridge = mock(Bridge.class);
        when(tapBridge.getActivity()).thenReturn(activity);
        UniversalPushPlugin tapPlugin = new UniversalPushPlugin();
        Field bridgeField = Plugin.class.getDeclaredField("bridge");
        bridgeField.setAccessible(true);
        bridgeField.set(tapPlugin, tapBridge);
        return tapPlugin;
    }

    // `deliverPendingTap()` calls `notifyListeners("push", tapEvent, true)`, which (with no listener
    // attached — these tests attach none, matching the real cold-start-tap timing the class doc
    // describes) retains the event in Plugin's own `retainedEventArguments` instead of discarding
    // it. Reading that real field is cheaper and more faithful than subclassing/mocking the
    // protected `notifyListeners` call across a package boundary.
    @SuppressWarnings("unchecked")
    private static List<JSObject> invokeDeliverPendingTapAndGetRetainedPushEvents(UniversalPushPlugin tapPlugin) throws Exception {
        Method deliverPendingTap = UniversalPushPlugin.class.getDeclaredMethod("deliverPendingTap");
        deliverPendingTap.setAccessible(true);
        deliverPendingTap.invoke(tapPlugin);

        Field retainedField = Plugin.class.getDeclaredField("retainedEventArguments");
        retainedField.setAccessible(true);
        Map<String, List<JSObject>> retained = (Map<String, List<JSObject>>) retainedField.get(tapPlugin);
        return retained.get("push");
    }

    /**
     * Kill (#915 wire-correction confirmation audit, kill-set K15; brief mandate: Android "emits
     * the typed tap event {@code {pushSurface,notificationKind,route}}"). Confirms the fix
     * (`PushRuntime.showNotification` now attaches `nativePushKind` to the tap `PendingIntent`'s
     * {@link Intent} extras; {@link UniversalPushPlugin#deliverPendingTap()} reads it back and
     * forwards it as {@code notificationKind}) by asserting the exact retained tap event values, not
     * just key presence — a tap on a reminder notification must be observationally distinguishable
     * from a tap on a message or call notification.
     */
    @Test
    public void deliverPendingTapEmitsPushSurfaceNotificationKindAndRoute() throws Exception {
        Intent launchIntent = launchIntentWith(BuildConfig.SHELL_BRAND, "reminder", ownPrefix());
        UniversalPushPlugin tapPlugin = pluginWithLaunchIntent(launchIntent);

        List<JSObject> pushEvents = invokeDeliverPendingTapAndGetRetainedPushEvents(tapPlugin);

        assertTrue(
            "deliverPendingTap must retain exactly one tap event for a valid launch intent",
            pushEvents != null && pushEvents.size() == 1
        );
        JSObject tapEvent = pushEvents.get(0);
        assertEquals(BuildConfig.SHELL_BRAND, tapEvent.getString("pushSurface"));
        assertEquals(
            "tap event must carry the exact notificationKind from the launch intent, not merely "
                + "the key's presence",
            "reminder", tapEvent.getString("notificationKind")
        );
        assertEquals(ownPrefix(), tapEvent.getString("route"));
    }

    // Kill: a launch intent missing `nativePushKind` (the pre-fix shape, or a stale/foreign intent)
    // must not tap-route at all, and — since surface/route were never validated together with a
    // kind — must leave both extras on the intent rather than consuming them.
    @Test
    public void deliverPendingTapRejectsMissingKindAndDoesNotConsumeValidExtras() throws Exception {
        Intent launchIntent = launchIntentWith(BuildConfig.SHELL_BRAND, null, ownPrefix());
        UniversalPushPlugin tapPlugin = pluginWithLaunchIntent(launchIntent);

        List<JSObject> pushEvents = invokeDeliverPendingTapAndGetRetainedPushEvents(tapPlugin);

        assertTrue(
            "a launch intent with no kind extra must not produce a tap event",
            pushEvents == null || pushEvents.isEmpty()
        );
        assertEquals(
            "a rejected tap must not consume the surface extra it never validated together with a kind",
            BuildConfig.SHELL_BRAND, launchIntent.getStringExtra("nativePushSurface")
        );
        assertEquals(
            "a rejected tap must not consume the route extra it never validated together with a kind",
            ownPrefix(), launchIntent.getStringExtra("nativePushRoute")
        );
    }

    // Kill: an undocumented kind (not message/reminder/call) must be rejected the same way a
    // missing kind is, not merely tolerated because a string was present.
    @Test
    public void deliverPendingTapRejectsInvalidKindAndDoesNotConsumeValidExtras() throws Exception {
        Intent launchIntent = launchIntentWith(BuildConfig.SHELL_BRAND, "marketing", ownPrefix());
        UniversalPushPlugin tapPlugin = pluginWithLaunchIntent(launchIntent);

        List<JSObject> pushEvents = invokeDeliverPendingTapAndGetRetainedPushEvents(tapPlugin);

        assertTrue(
            "a launch intent with an undocumented kind must not produce a tap event",
            pushEvents == null || pushEvents.isEmpty()
        );
        assertEquals(BuildConfig.SHELL_BRAND, launchIntent.getStringExtra("nativePushSurface"));
        assertEquals("marketing", launchIntent.getStringExtra("nativePushKind"));
        assertEquals(ownPrefix(), launchIntent.getStringExtra("nativePushRoute"));
    }
}
