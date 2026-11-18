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
     * Host activity left the foreground (dialog, app switch, screen locked).
     * Intentionally skips both WebView.onPause() and WebView.pauseTimers() so
     * pending WebView PermissionRequests (getUserMedia), AudioWorklet/WebAudio
     * Voice Mode sessions, and background agent streams are never aborted when
     * Android shows a permission prompt or switches overlays.
     */
    public static void pause(WebView webView) {
        if (webView == null) {
            return;
        }
        try {
            webView.evaluateJavascript(
                    "(function(){ try { window.dispatchEvent(new CustomEvent('agy:host-pause')); } catch(e){} })();",
                    null);
        } catch (Exception e) {
            Log.w(TAG, "failed to notify webView pause", e);
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
