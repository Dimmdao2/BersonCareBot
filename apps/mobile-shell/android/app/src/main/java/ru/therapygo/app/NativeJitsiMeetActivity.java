package ru.therapygo.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import java.util.HashMap;
import org.jitsi.meet.sdk.JitsiMeetActivity;
import org.jitsi.meet.sdk.JitsiMeetConferenceOptions;

/**
 * The SDK's full-screen Activity with a per-launch event handoff to NativeJitsi.
 *
 * JitsiMeetActivity already enters Android system PiP from onUserLeaveHint through its
 * JitsiMeetView delegate. Keeping that lifecycle in the SDK preserves normal movable,
 * resizable and stashable platform PiP instead of substituting a shell-owned window.
 */
public final class NativeJitsiMeetActivity extends JitsiMeetActivity {
    static final String ACTION_CONFERENCE_EVENT = "ru.therapygo.app.NATIVE_JITSI_CONFERENCE_EVENT";
    static final String EXTRA_CONFERENCE_ID = "conferenceId";
    static final String EXTRA_STATE = "state";
    static final String EXTRA_CODE = "code";

    private static final String JITSI_CONFERENCE_ACTION = "org.jitsi.meet.CONFERENCE";
    private static final String JITSI_CONFERENCE_OPTIONS = "JitsiMeetConferenceOptions";

    static void launch(Context context, JitsiMeetConferenceOptions options, String conferenceId) {
        Intent intent = new Intent(context, NativeJitsiMeetActivity.class)
            .setAction(JITSI_CONFERENCE_ACTION)
            .putExtra(JITSI_CONFERENCE_OPTIONS, options)
            .putExtra(EXTRA_CONFERENCE_ID, conferenceId);
        if (!(context instanceof Activity)) intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    String conferenceId() {
        return getIntent().getStringExtra(EXTRA_CONFERENCE_ID);
    }

    @Override
    protected void onUserLeaveHint() {
        // The parent delegates to JitsiMeetView.enterPictureInPicture(), including its own
        // support and permission-request guards.
        super.onUserLeaveHint();
    }

    @Override
    public void onBackPressed() {
        // A call-screen exit means system PiP, not the SDK's leave/finish path.
        onUserLeaveHint();
    }

    @Override
    protected void onConferenceJoined(HashMap<String, Object> data) {
        super.onConferenceJoined(data);
        notifyPlugin("joined", null);
    }

    @Override
    protected void onConferenceTerminated(HashMap<String, Object> data) {
        super.onConferenceTerminated(data);
        notifyPlugin("terminated", conferenceError(data));
    }

    @Override
    protected void onReadyToClose() {
        notifyPlugin("terminated", null);
        super.onReadyToClose();
    }

    private void notifyPlugin(String state, String code) {
        String conferenceId = conferenceId();
        if (conferenceId == null) return;
        Intent event = new Intent(ACTION_CONFERENCE_EVENT)
            .putExtra(EXTRA_CONFERENCE_ID, conferenceId)
            .putExtra(EXTRA_STATE, state);
        if (code != null) event.putExtra(EXTRA_CODE, code);
        LocalBroadcastManager.getInstance(this).sendBroadcast(event);
    }

    private static String conferenceError(HashMap<String, Object> data) {
        if (data == null) return null;
        Object value = data.get("error");
        if (!(value instanceof String)) return null;
        String code = (String) value;
        return code.matches("[A-Za-z0-9._-]{1,80}") ? code : "conference_error";
    }
}
