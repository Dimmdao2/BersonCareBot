package ru.therapygo.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;

/** Minimal CameraX activity: Preview plus exactly one capture use-case per mode. */
public final class CameraCaptureActivity extends ComponentActivity {
    public static final String EXTRA_INITIAL_KIND = "initialKind";
    public static final String EXTRA_RESULT_KIND = "resultKind";
    private PreviewView previewView;
    private ProcessCameraProvider cameraProvider;
    private ImageCapture imageCapture;
    private VideoCapture<Recorder> videoCapture;
    private Recording recording;
    private File activeOutput;
    private boolean deliveredResult;
    private boolean videoMode;
    private boolean frontCamera;
    private Button modeButton;
    private Button shutterButton;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        videoMode = "video".equals(getIntent().getStringExtra(EXTRA_INITIAL_KIND));
        buildLayout();
        ListenableFuture<ProcessCameraProvider> provider = ProcessCameraProvider.getInstance(this);
        provider.addListener(() -> {
            try {
                cameraProvider = provider.get();
                bindUseCase();
            } catch (Exception ignored) {
                setResult(RESULT_CANCELED);
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void buildLayout() {
        FrameLayout root = new FrameLayout(this);
        previewView = new PreviewView(this);
        root.addView(previewView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        modeButton = new Button(this);
        modeButton.setOnClickListener(view -> {
            if (recording != null) return;
            videoMode = !videoMode;
            bindUseCase();
        });
        Button cameraButton = new Button(this);
        cameraButton.setText("Flip");
        cameraButton.setOnClickListener(view -> {
            if (recording != null) return;
            frontCamera = !frontCamera;
            bindUseCase();
        });
        shutterButton = new Button(this);
        shutterButton.setOnClickListener(view -> capture());
        controls.addView(modeButton);
        controls.addView(cameraButton);
        controls.addView(shutterButton);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(controls, params);
        setContentView(root);
        refreshLabels();
    }

    private void bindUseCase() {
        if (cameraProvider == null) return;
        cameraProvider.unbindAll();
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());
        CameraSelector selector = new CameraSelector.Builder()
            .requireLensFacing(frontCamera ? CameraSelector.LENS_FACING_FRONT : CameraSelector.LENS_FACING_BACK)
            .build();
        try {
            if (videoMode) {
                Recorder recorder = new Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(Quality.HD))
                    .build();
                videoCapture = VideoCapture.withOutput(recorder);
                imageCapture = null;
                cameraProvider.bindToLifecycle(this, selector, preview, videoCapture);
            } else {
                imageCapture = new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build();
                videoCapture = null;
                cameraProvider.bindToLifecycle(this, selector, preview, imageCapture);
            }
            refreshLabels();
        } catch (Exception ignored) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    private void refreshLabels() {
        if (modeButton == null) return;
        modeButton.setText(videoMode ? "Photo" : "Video");
        shutterButton.setText(videoMode && recording != null ? "Stop" : videoMode ? "Record" : "Capture");
    }

    private void capture() {
        if (videoMode) {
            if (recording == null) startVideo(); else recording.stop();
        } else {
            capturePhoto();
        }
    }

    private void capturePhoto() {
        if (imageCapture == null) return;
        File output = new File(getCacheDir(), "camera-" + System.nanoTime() + ".jpg");
        imageCapture.takePicture(
            new ImageCapture.OutputFileOptions.Builder(output).build(),
            ContextCompat.getMainExecutor(this),
            new ImageCapture.OnImageSavedCallback() {
                @Override public void onImageSaved(@NonNull ImageCapture.OutputFileResults result) { complete(output, "photo"); }
                @Override public void onError(@NonNull ImageCaptureException error) {
                    output.delete();
                    setResult(RESULT_CANCELED);
                    finish();
                }
            }
        );
    }

    private void startVideo() {
        if (videoCapture == null) return;
        File output = new File(getCacheDir(), "camera-" + System.nanoTime() + ".mp4");
        activeOutput = output;
        PendingRecording pending = videoCapture.getOutput().prepareRecording(this, new FileOutputOptions.Builder(output).build());
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            pending = pending.withAudioEnabled();
        }
        recording = pending.start(ContextCompat.getMainExecutor(this), event -> {
            if (event instanceof VideoRecordEvent.Finalize) {
                recording = null;
                VideoRecordEvent.Finalize finalize = (VideoRecordEvent.Finalize) event;
                if (finalize.hasError()) {
                    output.delete();
                    activeOutput = null;
                    setResult(RESULT_CANCELED);
                    finish();
                } else {
                    activeOutput = null;
                    complete(output, "video");
                }
            }
            refreshLabels();
        });
        refreshLabels();
    }

    private void complete(File output, String kind) {
        deliveredResult = true;
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", output);
        Intent data = new Intent();
        // #setData(Uri) and #setType(String) each clear whatever the other previously set (Intent's
        // documented contract); only #setDataAndType keeps both, which DeviceMediaPlugin.onCaptureResult
        // (reads data.getData()) needs to see a successful capture instead of a null-URI cancellation.
        data.setDataAndType(uri, "video".equals(kind) ? "video/mp4" : "image/jpeg");
        data.putExtra(EXTRA_RESULT_KIND, kind);
        data.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    protected void onDestroy() {
        if (recording != null) recording.stop();
        if (!deliveredResult && activeOutput != null) activeOutput.delete();
        if (cameraProvider != null) cameraProvider.unbindAll();
        super.onDestroy();
    }
}
