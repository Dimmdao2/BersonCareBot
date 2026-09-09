package ru.therapygo.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Trusted-JS-facing configure/state/permission/revoke surface only; all RuStore SDK
 * initialization, listener installation, channel creation and notification rendering lives in the
 * single shared {@link PushRuntime}, which also runs from {@link ShellApplication#onCreate()} on a
 * cold process start. Tokens are delivered only across the trusted bridge.
 */
@CapacitorPlugin(name = "UniversalPush", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class UniversalPushPlugin extends Plugin {
    private final PushRuntime.Listener eventSink = this::deliverEvent;

    @Override
    public void load() {
        PushRuntime.instance().attach(eventSink);
    }

    @Override
    protected void handleOnDestroy() {
        PushRuntime.instance().detach(eventSink);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        if (!trusted(call)) return;
        String projectId = call.getString("projectId", "");
        if (!projectId.matches("[A-Za-z0-9._-]{1,128}")) {
            call.reject("Invalid push project id");
            return;
        }
        if (!PushRuntime.instance().configure(getContext(), projectId)) {
            call.reject("Push provider is already configured for this process");
            return;
        }
        PushRuntime.instance().checkAvailability(getContext());
        JSObject result = state("configured");
        result.put("available", PushRuntime.instance().isAvailable());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!trusted(call)) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(permissionResult("granted"));
            return;
        }
        requestPermissionForAlias("notifications", call, "onNotificationPermission");
    }

    @PermissionCallback
    private void onNotificationPermission(PluginCall call) {
        if (!trusted(call)) return;
        call.resolve(permissionResult(getPermissionState("notifications") == PermissionState.GRANTED ? "granted" : "denied"));
    }

    @PluginMethod
    public void getState(PluginCall call) {
        if (!trusted(call)) return;
        JSObject result = state("state");
        result.put("available", PushRuntime.instance().isAvailable());
        result.put("permission", notificationPermission());
        String token = PushRuntime.instance().currentToken();
        if (token != null) result.put("token", token);
        call.resolve(result);
    }

    @PluginMethod
    public void revoke(PluginCall call) {
        if (!trusted(call)) return;
        PushRuntime.instance().revoke();
        call.resolve(state("revoking"));
    }

    @Override
    protected void handleOnResume() {
        deliverPendingTap();
    }

    private void deliverEvent(String event, JSObject data) {
        notifyListeners(event, data);
    }

    private void deliverPendingTap() {
        Intent intent = getActivity().getIntent();
        String surface = intent.getStringExtra("nativePushSurface");
        String route = intent.getStringExtra("nativePushRoute");
        if (validSurface(surface) && validRoute(surface, route)) {
            JSObject pendingTap = state("tap");
            pendingTap.put("pushSurface", surface);
            pendingTap.put("route", route);
            intent.removeExtra("nativePushSurface");
            intent.removeExtra("nativePushRoute");
            // A cold-start tap precedes WebView bridge readiness; Capacitor delivers this once to the first listener.
            notifyListeners("push", pendingTap, true);
        }
    }

    private boolean trusted(PluginCall call) {
        if (TrustedOriginGate.isTrusted(getBridge().getWebView())) return true;
        call.reject("Unavailable from this page");
        return false;
    }

    private String notificationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED ? "granted" : "denied";
    }

    private JSObject permissionResult(String permission) {
        JSObject result = state("permission");
        result.put("permission", permission);
        return result;
    }

    private static JSObject state(String event) {
        JSObject result = new JSObject();
        result.put("event", event);
        return result;
    }

    /**
     * A data push surface is valid only when it names this process's own compiled brand — never the
     * sibling brand (MUST FIX-1). Package-private (not private) so {@link PushRuntime} shares this
     * exact validator instead of duplicating it; the auditor's reflection-based test still finds and
     * invokes it as a declared member of this class.
     */
    static boolean validSurface(String surface) {
        return BuildConfig.SHELL_BRAND.equals(surface);
    }

    static boolean validKind(String kind) {
        return "message".equals(kind) || "reminder".equals(kind) || "call".equals(kind);
    }

    /**
     * Rejects any literal {@code .}/{@code ..} path segment (MUST FIX-2: a textual
     * {@code startsWith} check alone lets {@code ..} normalize outside the allowed prefix) and
     * requires the route to equal one of the allowed surface prefixes or continue with a
     * {@code /} boundary, so a route like {@code /app/patientized} can no longer pass by sharing a
     * string prefix without sharing a path segment. Therapysto's staff surface spans three roots
     * (`/app/doctor`, `/app/settings`, `/app/account`) so this stays the observable mirror of the
     * server-side allowlist (`deliveryAdapter.ts:surfaceForPathname`) instead of drifting to a
     * single-prefix subset of it.
     */
    static boolean validRoute(String surface, String route) {
        if (route == null || route.length() > 256 || !route.matches("/[A-Za-z0-9/_?=&.-]*")) return false;
        for (String segment : route.split("/", -1)) {
            if (".".equals(segment) || "..".equals(segment)) return false;
        }
        if ("therapygo".equals(surface)) {
            return route.equals("/app/patient") || route.startsWith("/app/patient/");
        }
        for (String prefix : THERAPYSTO_ROUTE_PREFIXES) {
            if (route.equals(prefix) || route.startsWith(prefix + "/")) return true;
        }
        return false;
    }

    private static final String[] THERAPYSTO_ROUTE_PREFIXES = { "/app/doctor", "/app/settings", "/app/account" };

    /**
     * Bounded, non-blank native notification copy (MASTER_PLAN M6-09/M6-10): Android independently
     * enforces the same limits the server already trims to (title 120, body 240 Unicode code
     * points) rather than trusting the wire, and never falls back to placeholder text.
     */
    static boolean validCopy(String title, String body) {
        if (title == null || title.trim().isEmpty() || title.codePointCount(0, title.length()) > 120) {
            return false;
        }
        return body != null && body.codePointCount(0, body.length()) <= 240;
    }
}
