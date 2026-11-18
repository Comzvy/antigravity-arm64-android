package com.agy.core;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.PowerManager;
import android.util.Log;

/**
 * Holds a partial wake lock (CPU) and a high-performance Wi-Fi lock for the
 * core's lifetime, so the agent keeps computing and keeps its network link
 * while the app is in the background or the screen is locked.
 */
public final class WakeLockHolder {

    private static final String TAG = "WakeLockHolder";

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    public void acquire(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "agy::core");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception e) {
            Log.w(TAG, "wakelock failed", e);
        }
        try {
            WifiManager wm = (WifiManager) context.getApplicationContext()
                    .getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                // FULL_HIGH_PERF keeps the radio awake with the screen off
                // (deprecated on 34+ but still honored for targetSdk 28).
                @SuppressWarnings("deprecation")
                int wifiMode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(wifiMode, "agy::core-wifi");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception e) {
            Log.w(TAG, "wifilock failed", e);
        }
    }

    public void release() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
    }
}
