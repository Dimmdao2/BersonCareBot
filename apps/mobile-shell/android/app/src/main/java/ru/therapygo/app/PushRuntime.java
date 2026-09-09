package ru.therapygo.app;

import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.util.Collections;
import java.util.Map;
import ru.rustore.sdk.core.tasks.OnFailureListener;
import ru.rustore.sdk.core.tasks.OnSuccessListener;
import ru.rustore.sdk.universalpush.RuStoreUniversalPushClient;
import ru.rustore.sdk.universalpush.domain.model.UniversalRemoteMessage;
import ru.rustore.sdk.universalpush.rustore.providers.RuStorePushProvider;

/**
 * The one shared native Push runtime. {@link ShellApplication#onCreate()} bootstraps it from the
 * persisted project id on every cold process start (so a data-only message can render a
 * notification even if the WebView never loads); {@link UniversalPushPlugin} delegates its trusted
 * configure/state/permission/revoke surface to the same instance. There is exactly one RuStore SDK
 * {@code init}, one set of listeners, one channel-creation call and one notification-rendering
 * method in the whole app; nothing here is duplicated in the plugin.
 */
final class PushRuntime {
    private static final PushRuntime INSTANCE = new PushRuntime();

    static PushRuntime instance() {
        return INSTANCE;
    }

    private static final String PREFS_NAME = "universal_push_runtime";
    private static final String KEY_PROJECT_ID = "project_id";
    private static final String PROVIDER = "rustore";
    private static final String CHANNEL_MESSAGE = "therapygo_message_v1";
    private static final String CHANNEL_REMINDER = "therapygo_reminder_v1";
    private static final String CHANNEL_CALL = "therapygo_call_v1";

    private volatile Context appContext;
    private volatile String initializedProjectId;
    private volatile boolean available;
    private volatile String currentToken;
    private volatile Listener listener;

    private PushRuntime() {}

    /** The trusted plugin instance currently able to receive events; at most one attached at a time. */
    interface Listener {
        void onPushEvent(String event, JSObject data);
    }

    synchronized void attach(Listener target) {
        listener = target;
    }

    synchronized void detach(Listener target) {
        if (listener == target) listener = null;
    }

    /** Called once from {@code Application#onCreate()} on every process start, before any delivery. */
    synchronized void bootstrap(Context context) {
        String projectId = persistedProjectId(context);
        if (projectId != null) initializeLocked(context, projectId);
    }

    /**
     * Called only from the trusted {@code UniversalPush.configure} plugin call, after syntax
     * validation. Returns {@code false} if this process already initialized for a *different*
     * project id (a caller bug, not a retry of the same configuration).
     */
    synchronized boolean configure(Context context, String projectId) {
        String stored = persistedProjectId(context);
        if (stored != null && !stored.equals(projectId)) return false;
        if (stored == null) persistProjectId(context, projectId);
        initializeLocked(context, projectId);
        return true;
    }

    private void initializeLocked(Context context, String projectId) {
        if (initializedProjectId != null) return;
        Context application = context.getApplicationContext();
        appContext = application;
        RuStorePushProvider provider = new RuStorePushProvider(
            (Application) application, projectId, NoopPushLogger.INSTANCE, Collections.emptyMap()
        );
        RuStoreUniversalPushClient.INSTANCE.init(application, provider, null, null);
        initializedProjectId = projectId;
        installListeners();
        createChannels(application);
    }

    boolean isAvailable() {
        return available;
    }

    String currentToken() {
        return currentToken;
    }

    void checkAvailability(Context context) {
        RuStoreUniversalPushClient.INSTANCE.checkAvailability(context)
            .addOnSuccessListener((OnSuccessListener<Map<String, Boolean>>) values -> {
                available = Boolean.TRUE.equals(values.get(PROVIDER));
                emit("availability", null);
                fetchToken();
            })
            .addOnFailureListener((OnFailureListener) error -> emit("error", "availability_failed"));
    }

    /** Logout: deletes provider tokens only. The persisted project id survives for the next bootstrap. */
    void revoke() {
        RuStoreUniversalPushClient.INSTANCE.getTokens()
            .addOnSuccessListener((OnSuccessListener<Map<String, String>>) tokens -> {
                RuStoreUniversalPushClient.INSTANCE.deleteTokens(tokens)
                    .addOnCompletionListener(task -> {
                        currentToken = null;
                        emit("revoked", null);
                    });
            })
            .addOnFailureListener((OnFailureListener) error -> {
                currentToken = null;
                emit("revoked", null);
            });
    }

    private void fetchToken() {
        RuStoreUniversalPushClient.INSTANCE.getTokens()
            .addOnSuccessListener((OnSuccessListener<Map<String, String>>) tokens -> {
                currentToken = tokens.get(PROVIDER);
                if (currentToken != null) emit("token", null);
            })
            .addOnFailureListener((OnFailureListener) error -> emit("error", "token_unavailable"));
    }

    private void installListeners() {
        RuStoreUniversalPushClient.INSTANCE.setOnNewTokenListener((provider, token) -> {
            if (PROVIDER.equals(provider)) {
                currentToken = token;
                emit("token", null);
            }
        });
        RuStoreUniversalPushClient.INSTANCE.setOnDeletedMessagesListener(provider -> emit("deleted_messages", null));
        RuStoreUniversalPushClient.INSTANCE.setOnPushClientErrorListener((provider, errors) -> emit("error", "provider_error"));
        RuStoreUniversalPushClient.INSTANCE.setOnMessageReceiveListener(this::handleMessage);
    }

    private void handleMessage(UniversalRemoteMessage message) {
        Map<String, String> data = message.getData();
        String surface = data.get("surface");
        String kind = data.get("kind");
        String route = data.get("route");
        if (!UniversalPushPlugin.validSurface(surface) || !UniversalPushPlugin.validKind(kind) || !UniversalPushPlugin.validRoute(surface, route)) {
            emit("message_rejected", "invalid_payload");
            return;
        }
        // Rendered here so a data-only message still notifies with no trusted JS/plugin listener
        // attached yet (cold process start, or the WebView not loaded).
        showNotification(surface, kind, route);
        Listener target = listener;
        if (target != null) {
            JSObject event = state("message");
            event.put("surface", surface);
            event.put("kind", kind);
            event.put("route", route);
            target.onPushEvent("push", event);
        }
    }

    private void showNotification(String surface, String kind, String route) {
        Context context = appContext;
        if (context == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            emit("permission_denied", null);
            return;
        }
        Intent intent = new Intent(context, MainActivity.class)
            .setAction("ru.therapygo.app.PUSH_TAP")
            .putExtra("nativePushSurface", surface)
            .putExtra("nativePushRoute", route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(
            context, (surface + kind + route).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String channel = "call".equals(kind) ? CHANNEL_CALL : "reminder".equals(kind) ? CHANNEL_REMINDER : CHANNEL_MESSAGE;
        Notification notification = new Notification.Builder(context, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText("New notification")
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build();
        context.getSystemService(NotificationManager.class).notify((surface + kind + route).hashCode(), notification);
    }

    private void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build();
        manager.createNotificationChannel(channel(context, CHANNEL_MESSAGE, "Messages", R.raw.tone_message, attributes));
        manager.createNotificationChannel(channel(context, CHANNEL_REMINDER, "Reminders", R.raw.tone_reminder, attributes));
        manager.createNotificationChannel(channel(context, CHANNEL_CALL, "Calls", R.raw.tone_call, attributes));
    }

    private static NotificationChannel channel(Context context, String id, String name, int sound, AudioAttributes attributes) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT);
        channel.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/" + sound), attributes);
        return channel;
    }

    private void emit(String event, String code) {
        JSObject result = state(event);
        result.put("available", available);
        if (currentToken != null && "token".equals(event)) result.put("token", currentToken);
        if (code != null) result.put("code", code);
        Listener target = listener;
        if (target != null) target.onPushEvent("push", result);
    }

    private static JSObject state(String event) {
        JSObject result = new JSObject();
        result.put("event", event);
        return result;
    }

    private static String persistedProjectId(Context context) {
        return prefs(context).getString(KEY_PROJECT_ID, null);
    }

    private static void persistProjectId(Context context, String projectId) {
        prefs(context).edit().putString(KEY_PROJECT_ID, projectId).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
