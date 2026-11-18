package com.agy.theme;

import android.content.Context;
import android.content.SharedPreferences;

/** Persists the user's theme mode. */
public final class ThemePrefs {

    private static final String PREFS = "agy_prefs";
    // v4: v3 was clobbered with the resolved visual theme on every Web UI
    // paint (system mode was lost), so start every install back on "system".
    private static final String KEY_MODE = "theme_mode_v4";

    private ThemePrefs() {
    }

    public static int load(Context appContext) {
        return appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getInt(KEY_MODE, ThemeColors.MODE_SYSTEM);
    }

    public static void save(Context appContext, int mode) {
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putInt(KEY_MODE, mode).apply();
    }
}
