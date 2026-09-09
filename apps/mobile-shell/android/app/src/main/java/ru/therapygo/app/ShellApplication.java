package ru.therapygo.app;

import android.app.Application;

/**
 * The RuStore Universal Push SDK contract initializes from {@code Application#onCreate()} and
 * installs its receive/token/error callbacks before any message can be delivered. Declared as the
 * manifest {@code android:name} so this runs on every process start — including a cold start where
 * Android launches the process only to deliver a data-only push, with no {@link MainActivity} and no
 * WebView. If this build has never had {@code UniversalPush.configure} called (fresh install, no
 * token ever registered yet), {@link PushRuntime#bootstrap} finds no persisted project id and is a
 * safe no-op. No service token or send endpoint is read here or anywhere in the bundle.
 */
public final class ShellApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        PushRuntime.instance().bootstrap(this);
    }
}
