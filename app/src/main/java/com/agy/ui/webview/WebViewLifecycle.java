package com.agy.ui.webview;

import android.util.Log;
import android.webkit.WebView;

/** WebView resume/timer/memory lifecycle, kept out of the activity. */
public final class WebViewLifecycle {

    private static final String TAG = "WebViewHost";

    private WebViewLifecycle() {
    }

    /** Resume the page and tell it the host is back in front. */
    public static void resume(WebView webView) {
        if (webView == null) {
            return;
        }
        try {
            webView.onResume();
            webView.resumeTimers();
            webView.evaluateJavascript(
                    "(function(){ try { window.dispatchEvent(new CustomEvent('agy:host-resume')); } catch(e){} })();",
                    null);
        } catch (Exception e) {
            Log.w(TAG, "failed to resume webView", e);
        }
    }

    /**
     * Host activity left the foreground (home, app switch, screen locked).
     * Only animations/geolocation are paused (WebView.onPause); JavaScript
     * timers keep running on purpose so the agent UI (streams, polling,
     * completion sounds) continues in the background and on a locked screen.
     * pauseTimers() is NOT used: it freezes every WebView JS timer process-wide.
     */
    public static void pause(WebView webView) {
        if (webView == null) {
            return;
        }
        try {
            webView.onPause();
            webView.evaluateJavascript(
                    "(function(){ try { window.dispatchEvent(new CustomEvent('agy:host-pause')); } catch(e){} })();",
                    null);
        } catch (Exception e) {
            Log.w(TAG, "failed to pause webView", e);
        }
    }

    public static void freeMemory(WebView webView) {
        if (webView == null) {
            return;
        }
        try {
            webView.freeMemory();
        } catch (Exception e) {
            Log.w(TAG, "freeMemory failed", e);
        }
    }
}
