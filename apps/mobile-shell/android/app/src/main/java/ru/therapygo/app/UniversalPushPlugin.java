package ru.therapygo.app;

import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Collections;
import java.util.Map;
import ru.rustore.sdk.core.tasks.OnFailureListener;
import ru.rustore.sdk.core.tasks.OnSuccessListener;
import ru.rustore.sdk.pushclient.common.logger.DefaultLogger;
import ru.rustore.sdk.universalpush.RuStoreUniversalPushClient;
import ru.rustore.sdk.universalpush.domain.model.UniversalRemoteMessage;
import ru.rustore.sdk.universalpush.rustore.providers.RuStorePushProvider;

/** RuStore-only provider adapter; tokens are delivered only across the trusted bridge. */
@CapacitorPlugin(name = "UniversalPush", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class UniversalPushPlugin extends Plugin {
    private static final String PROVIDER = "rustore";
    private static final String CHANNEL_MESSAGE = "therapygo_message_v1";
    private static final String CHANNEL_REMINDER = "therapygo_reminder_v1";
    private static final String CHANNEL_CALL = "therapygo_call_v1";
    private String configuredProjectId;
    private String currentToken;
    private boolean available;
    private JSObject pendingTap;

    @PluginMethod
    public void configure(PluginCall call) {
        if (!trusted(call)) return;
        String projectId = call.getString("projectId", "");
        if (!projectId.matches("[A-Za-z0-9._-]{1,128}")) {
            call.reject("Invalid push project id");
            return;
        }
        if (configuredProjectId == null) {
            RuStorePushProvider provider = new RuStorePushProvider(
                (Application) getContext().getApplicationContext(), projectId, new DefaultLogger(), Collections.emptyMap()
            );
            RuStoreUniversalPushClient.INSTANCE.init(getContext(), provider, null, null);
            configuredProjectId = projectId;
            installListeners();
            createChannels();
        } else if (!configuredProjectId.equals(projectId)) {
            call.reject("Push provider is already configured for this process");
            return;
        }
        RuStoreUniversalPushClient.INSTANCE.checkAvailability(getContext())
            .addOnSuccessListener((OnSuccessListener<Map<String, Boolean>>) values -> {
                available = Boolean.TRUE.equals(values.get(PROVIDER));
                emitState("availability", null);
                fetchToken();
            })
            .addOnFailureListener((OnFailureListener) error -> emitState("error", "availability_failed"));
        JSObject result = state("configured");
        result.put("available", available);
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
        result.put("available", available);
        result.put("permission", notificationPermission());
        if (currentToken != null) result.put("token", currentToken);
        call.resolve(result);
    }

    @PluginMethod
    public void revoke(PluginCall call) {
        if (!trusted(call)) return;
        RuStoreUniversalPushClient.INSTANCE.getTokens()
            .addOnSuccessListener((OnSuccessListener<Map<String, String>>) tokens -> {
                RuStoreUniversalPushClient.INSTANCE.deleteTokens(tokens)
                    .addOnCompletionListener(task -> {
                        currentToken = null;
                        emitState("revoked", null);
                    });
            })
            .addOnFailureListener((OnFailureListener) error -> {
                currentToken = null;
                emitState("revoked", null);
            });
        call.resolve(state("revoking"));
    }

    @Override
    protected void handleOnResume() {
        deliverPendingTap();
    }

    private void installListeners() {
        RuStoreUniversalPushClient.INSTANCE.setOnNewTokenListener((provider, token) -> {
            if (PROVIDER.equals(provider)) {
                currentToken = token;
                emitState("token", null);
            }
        });
        RuStoreUniversalPushClient.INSTANCE.setOnDeletedMessagesListener(provider -> emitState("deleted_messages", null));
        RuStoreUniversalPushClient.INSTANCE.setOnPushClientErrorListener((provider, errors) -> emitState("error", "provider_error"));
        RuStoreUniversalPushClient.INSTANCE.setOnMessageReceiveListener(this::handleMessage);
    }

    private void fetchToken() {
        RuStoreUniversalPushClient.INSTANCE.getTokens()
            .addOnSuccessListener((OnSuccessListener<Map<String, String>>) tokens -> {
                currentToken = tokens.get(PROVIDER);
                if (currentToken != null) emitState("token", null);
            })
            .addOnFailureListener((OnFailureListener) error -> emitState("error", "token_unavailable"));
    }

    private void handleMessage(UniversalRemoteMessage message) {
        Map<String, String> data = message.getData();
        String surface = data.get("surface");
        String kind = data.get("kind");
        String route = data.get("route");
        if (!validSurface(surface) || !validKind(kind) || !validRoute(surface, route)) {
            emitState("message_rejected", "invalid_payload");
            return;
        }
        showNotification(surface, kind, route);
        JSObject event = state("message");
        event.put("surface", surface);
        event.put("kind", kind);
        event.put("route", route);
        notifyListeners("push", event);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build();
        manager.createNotificationChannel(channel(CHANNEL_MESSAGE, "Messages", R.raw.tone_message, attributes));
        manager.createNotificationChannel(channel(CHANNEL_REMINDER, "Reminders", R.raw.tone_reminder, attributes));
        manager.createNotificationChannel(channel(CHANNEL_CALL, "Calls", R.raw.tone_call, attributes));
    }

    private NotificationChannel channel(String id, String name, int sound, AudioAttributes attributes) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT);
        channel.setSound(Uri.parse("android.resource://" + getContext().getPackageName() + "/" + sound), attributes);
        return channel;
    }

    private void showNotification(String surface, String kind, String route) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            emitState("permission_denied", null);
            return;
        }
        Intent intent = new Intent(getContext(), MainActivity.class)
            .setAction("ru.therapygo.app.PUSH_TAP")
            .putExtra("nativePushSurface", surface)
            .putExtra("nativePushRoute", route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(getContext(), (surface + kind + route).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String channel = "call".equals(kind) ? CHANNEL_CALL : "reminder".equals(kind) ? CHANNEL_REMINDER : CHANNEL_MESSAGE;
        Notification notification = new Notification.Builder(getContext(), channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Therapy Go")
            .setContentText("New notification")
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build();
        getContext().getSystemService(NotificationManager.class).notify((surface + kind + route).hashCode(), notification);
    }

    private void deliverPendingTap() {
        Intent intent = getActivity().getIntent();
        String surface = intent.getStringExtra("nativePushSurface");
        String route = intent.getStringExtra("nativePushRoute");
        if (validSurface(surface) && validRoute(surface, route)) {
            pendingTap = state("tap");
            pendingTap.put("surface", surface);
            pendingTap.put("route", route);
            intent.removeExtra("nativePushSurface");
            intent.removeExtra("nativePushRoute");
            // A cold-start tap precedes WebView bridge readiness; Capacitor delivers this once to the first listener.
            notifyListeners("push", pendingTap, true);
            pendingTap = null;
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

    private void emitState(String event, String code) {
        JSObject result = state(event);
        result.put("available", available);
        if (currentToken != null && "token".equals(event)) result.put("token", currentToken);
        if (code != null) result.put("code", code);
        notifyListeners("push", result);
    }

    private static JSObject state(String event) {
        JSObject result = new JSObject();
        result.put("event", event);
        return result;
    }

    private static boolean validSurface(String surface) {
        return "therapygo".equals(surface) || "therapysto".equals(surface);
    }

    private static boolean validKind(String kind) {
        return "message".equals(kind) || "reminder".equals(kind) || "call".equals(kind);
    }

    private static boolean validRoute(String surface, String route) {
        if (route == null || route.length() > 256 || !route.matches("/[A-Za-z0-9/_?=&.-]*")) return false;
        return "therapygo".equals(surface) ? route.startsWith("/app/patient") : route.startsWith("/app/doctor");
    }
}
