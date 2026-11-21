package com.agy.core;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.agy.runtime.RuntimeManager;

import java.io.File;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Foreground host for the patched core (language_server). Holds a wake lock,
 * streams the process log to files/logs/core.log, and publishes serverUrl once
 * ready.
 */
public final class CoreServerService extends Service {

    private static final String TAG = "CoreServer";
    public static final String ACTION_STOP_APP =
            com.agy.BuildConfig.APPLICATION_ID + ".action.STOP_APP";
    public static final String ACTION_REPOST_NOTIFICATION =
            com.agy.BuildConfig.APPLICATION_ID + ".action.REPOST_NOTIFICATION";

    private static volatile CoreServerService activeService;
    private static final Handler PROCESS_EXIT_HANDLER = new Handler(Looper.getMainLooper());
    private static Runnable pendingProcessExit;

    private RuntimeManager runtime;
    private WakeLockHolder wakeLock;
    private OpenUrlWatcher openUrlWatcher;
    private CoreProcessSupervisor supervisor;
    private com.agy.log.LogRingBuffer logBuffer;
    private com.agy.gateway.SystemGatewayServer gatewayServer;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicBoolean cleanedUp = new AtomicBoolean(false);
    private volatile boolean destroyed;
    private volatile boolean stoppingByUser;

    /** Cancels any scheduled process termination when the app or service restarts. */
    public static synchronized void cancelPendingProcessExit() {
        if (pendingProcessExit != null) {
            PROCESS_EXIT_HANDLER.removeCallbacks(pendingProcessExit);
            pendingProcessExit = null;
        }
    }

    private static synchronized void scheduleProcessExit() {
        cancelPendingProcessExit();
        pendingProcessExit = new Runnable() {
            @Override
            public void run() {
                synchronized (CoreServerService.class) {
                    pendingProcessExit = null;
                }
                android.os.Process.killProcess(android.os.Process.myPid());
            }
        };
        PROCESS_EXIT_HANDLER.postDelayed(pendingProcessExit, 250);
    }

    /** Restarts the running core process or starts CoreServerService if not running. */
    public static boolean restartCore(android.content.Context context) {
        CoreServerService svc = activeService;
        if (svc != null && !svc.destroyed && svc.supervisor != null) {
            svc.supervisor.restart();
            return true;
        }
        if (context != null) {
            CoreServiceLauncher.start(context.getApplicationContext());
            return true;
        }
        return false;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        cancelPendingProcessExit();
        activeService = this;
        destroyed = false;
        stoppingByUser = false;
        cleanedUp.set(false);

        runtime = new RuntimeManager(this);
        logBuffer = new com.agy.log.LogRingBuffer();
        gatewayServer = new com.agy.gateway.SystemGatewayServer(this, logBuffer, com.agy.BuildConfig.GATEWAY_PORT);
        gatewayServer.start();

        Log.i(TAG, "state paths: HOME=" + getFilesDir().getAbsolutePath()
                + " appData=" + runtime.getAppDataDir().getAbsolutePath()
                + " projects=" + runtime.getProjectsDir().getAbsolutePath()
                + " runtime=" + runtime.getRuntimeDir().getAbsolutePath());
        CoreRuntimeState.httpsPort = runtime.getHttpsPort();
        CoreRuntimeState.csrfToken = runtime.getCsrfToken();
        CoreRuntimeState.restarting = false;
        CoreRuntimeState.lastError = null;
        CoreRuntimeState.serverUrl = null;

        ForegroundNotification.start(this, "Core running");
        wakeLock = new WakeLockHolder();
        wakeLock.acquire(this);

        openUrlWatcher = new OpenUrlWatcher(this);
        openUrlWatcher.start();

        supervisor = new CoreProcessSupervisor(this, runtime, openUrlWatcher, logBuffer,
                this::onSupervisorTerminated);
        supervisor.start();

        startBackgroundDaemon();
    }

    private void startBackgroundDaemon() {
        new Thread(() -> {
            try {
                // Give runtime environment a brief moment to stabilize
                Thread.sleep(1500);
                if (destroyed || stoppingByUser) {
                    return;
                }
                File daemonBin = new File(getFilesDir(), "usr/bin/agy-daemon");
                if (daemonBin.canExecute()) {
                    Log.i(TAG, "Starting autonomous background daemon...");
                    ProcessBuilder pb = new ProcessBuilder(daemonBin.getAbsolutePath(), "start");
                    pb.directory(getFilesDir());
                    pb.environment().put("PATH", getFilesDir().getAbsolutePath() + "/usr/bin:" + System.getenv("PATH"));
                    pb.environment().put("HOME", getFilesDir().getAbsolutePath());
                    pb.start();
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to start agy-daemon: " + e.getMessage());
            }
        }, "AgyDaemonStarter").start();
    }

    private void stopBackgroundDaemon() {
        try {
            File daemonBin = new File(getFilesDir(), "usr/bin/agy-daemon");
            if (daemonBin.canExecute()) {
                Log.i(TAG, "Stopping autonomous background daemon...");
                ProcessBuilder pb = new ProcessBuilder(daemonBin.getAbsolutePath(), "stop");
                pb.directory(getFilesDir());
                pb.environment().put("PATH", getFilesDir().getAbsolutePath() + "/usr/bin:" + System.getenv("PATH"));
                pb.environment().put("HOME", getFilesDir().getAbsolutePath());
                Process p = pb.start();
                if (!p.waitFor(1500, TimeUnit.MILLISECONDS)) {
                    Log.w(TAG, "agy-daemon stop timed out after 1500ms; destroying forcibly");
                    p.destroyForcibly();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to stop agy-daemon: " + e.getMessage());
        }
    }

    private void onSupervisorTerminated() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (destroyed || stoppingByUser) {
                    return;
                }
                CoreRuntimeState.serverUrl = null;
                CoreRuntimeState.restarting = false;
                if (CoreRuntimeState.lastError == null) {
                    CoreRuntimeState.lastError = "core supervisor stopped unexpectedly";
                }
                if (wakeLock != null) {
                    wakeLock.release();
                }
                if (runtime != null) {
                    runtime.stopNetworkMonitor();
                }
                if (openUrlWatcher != null) {
                    openUrlWatcher.stop();
                }
                ForegroundNotification.update(CoreServerService.this,
                        "Core stopped — open app to retry");
            }
        });
    }

    private void cleanupCoreResources() {
        if (!cleanedUp.compareAndSet(false, true)) {
            return;
        }
        mainHandler.removeCallbacksAndMessages(null);
        if (gatewayServer != null) {
            gatewayServer.stop();
        }
        // Intentional stop: the watchdog must not treat the exit as a crash.
        if (supervisor != null) {
            supervisor.stop();
        }
        if (openUrlWatcher != null) {
            openUrlWatcher.stop();
        }
        if (wakeLock != null) {
            wakeLock.release();
        }
        if (runtime != null) {
            runtime.stopNetworkMonitor();
        }
        CoreRuntimeState.serverUrl = null;
        CoreRuntimeState.lastError = null;
        CoreRuntimeState.restarting = false;
    }

    private void handleStopApp() {
        if (stoppingByUser) {
            return;
        }
        Log.i(TAG, "Stop App requested from status bar notification");
        stoppingByUser = true;
        destroyed = true;
        com.agy.ui.MainActivity.finishAndRemoveTaskSafely();
        ForegroundNotification.cancel(this);
        cleanupCoreResources();
        new Thread(() -> {
            stopBackgroundDaemon();
            mainHandler.post(() -> {
                ForegroundNotification.cancel(CoreServerService.this);
                stopSelf();
                scheduleProcessExit();
            });
        }, "AgyStopThread").start();
    }

    @Override
    public void onDestroy() {
        if (activeService == this) {
            activeService = null;
        }
        destroyed = true;
        ForegroundNotification.cancel(this);
        if (!stoppingByUser) {
            stopBackgroundDaemon();
        }
        cleanupCoreResources();
        super.onDestroy();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP_APP.equals(action)) {
            handleStopApp();
            return START_NOT_STICKY;
        }
        if (ACTION_REPOST_NOTIFICATION.equals(action)) {
            if (!destroyed && !stoppingByUser) {
                ForegroundNotification.repostIfActive(this);
            }
            return START_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
