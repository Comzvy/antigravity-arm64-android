package com.agy.core;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

/**
 * Asks the user to exempt the app from battery optimization (Doze/App
 * Standby). Without the exemption Doze ignores the core's partial wake lock
 * and cuts network access once the screen is locked, which stalls the agent.
 * The prompt is rate-limited so a denial does not nag on every resume.
 */
public final class BatteryOptimization {

    private static final String TAG = "BatteryOptimization";
    private static final String PREFS = "agy_prefs";
    private static final String KEY_LAST_PROMPT = "battery_opt_last_prompt_ms";
    private static final long REPROMPT_INTERVAL_MS = 24L * 60L * 60L * 1000L;

    private BatteryOptimization() {
    }

    public static boolean isIgnoring(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return pm == null || pm.isIgnoringBatteryOptimizations(context.getPackageName());
        } catch (Exception e) {
            return true;
        }
    }

    /** Shows the system exemption dialog at most once per day until granted. */
    public static void requestIfNeeded(Activity activity) {
        if (activity == null || isIgnoring(activity)) {
            return;
        }
        long now = System.currentTimeMillis();
        long last = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getLong(KEY_LAST_PROMPT, 0L);
        if (now - last < REPROMPT_INTERVAL_MS) {
            return;
        }
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putLong(KEY_LAST_PROMPT, now).apply();
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "direct exemption dialog unavailable, opening settings list", e);
            try {
                activity.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored) {
            }
        }
    }
}
