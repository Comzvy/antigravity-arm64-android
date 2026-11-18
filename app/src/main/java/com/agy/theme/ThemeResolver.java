package com.agy.theme;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;

/** Resolves an explicit or system-following mode to darkness. */
public final class ThemeResolver {

    private ThemeResolver() {
    }

    public static boolean isDark(int mode, Context context) {
        if (mode == ThemeColors.MODE_DARK) {
            return true;
        }
        if (mode == ThemeColors.MODE_LIGHT) {
            return false;
        }
        // MODE_SYSTEM
        return isSystemDark(context);
    }

    /**
     * Raw OS dark-mode state, independent of the persisted in-app mode. The
     * Web UI's "system" theme is driven by this value.
     */
    public static boolean isSystemDark(Context context) {
        if (context == null) {
            return false;
        }

        // 1. Try context Configuration (Activity reflects onConfigurationChanged immediately)
        Boolean fromCtx = nightFromConfig(context);
        if (fromCtx != null) {
            return fromCtx;
        }

        // 2. Try ApplicationContext Configuration
        try {
            Context appCtx = context.getApplicationContext();
            if (appCtx != null && appCtx != context) {
                Boolean fromApp = nightFromConfig(appCtx);
                if (fromApp != null) {
                    return fromApp;
                }
            }
        } catch (Exception ignored) {
        }

        // 3. Ask UiModeManager directly (explicit yes/no night modes only)
        try {
            UiModeManager ui = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
            if (ui != null) {
                int night = ui.getNightMode();
                if (night == UiModeManager.MODE_NIGHT_YES) {
                    return true;
                }
                if (night == UiModeManager.MODE_NIGHT_NO) {
                    return false;
                }
            }
        } catch (Exception ignored) {
        }

        // Fallback: default light
        return false;
    }

    private static Boolean nightFromConfig(Context context) {
        try {
            int uiMode = context.getResources().getConfiguration().uiMode
                    & Configuration.UI_MODE_NIGHT_MASK;
            if (uiMode == Configuration.UI_MODE_NIGHT_YES) {
                return Boolean.TRUE;
            }
            if (uiMode == Configuration.UI_MODE_NIGHT_NO) {
                return Boolean.FALSE;
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}
