package com.agy.ui.lifecycle;

import android.app.Activity;
import android.os.SystemClock;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.Toast;

/**
 * Back handling:
 * 1. Dismiss open WebView modals/overlays/drawers via window.__agHandleAndroidBack().
 * 2. Walk WebView navigation history if available.
 * 3. Require a double-back-press within 2 seconds before minimizing/exiting the app.
 */
public final class BackNavigator {

    private static final long EXIT_CONFIRM_WINDOW_MS = 2000L;
    private static long lastBackPressMs = 0L;

    private BackNavigator() {
    }

    /** Returns true when the back press was consumed (always handled asynchronously when WebView exists). */
    public static boolean handle(final Activity activity, final WebView webView, final Runnable fallbackBackAction) {
        if (webView == null) {
            return false;
        }
        try {
            webView.evaluateJavascript(
                    "(function(){try{return !!(window.__agHandleAndroidBack&&window.__agHandleAndroidBack());}catch(e){return false;}})()",
                    new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            if ("true".equals(value)) {
                                return;
                            }
                            if (webView.canGoBack()) {
                                webView.goBack();
                                return;
                            }
                            long now = SystemClock.elapsedRealtime();
                            if (now - lastBackPressMs < EXIT_CONFIRM_WINDOW_MS) {
                                lastBackPressMs = 0L;
                                if (fallbackBackAction != null) {
                                    fallbackBackAction.run();
                                } else if (activity != null) {
                                    activity.moveTaskToBack(true);
                                }
                            } else {
                                lastBackPressMs = now;
                                if (activity != null) {
                                    Toast.makeText(activity, "Press back again to exit", Toast.LENGTH_SHORT).show();
                                }
                            }
                        }
                    });
            return true;
        } catch (Throwable ignored) {
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            return false;
        }
    }

    /** Legacy overload for compatibility. */
    public static boolean handle(WebView webView) {
        return handle(com.agy.ui.MainActivity.activeActivity, webView, null);
    }
}

