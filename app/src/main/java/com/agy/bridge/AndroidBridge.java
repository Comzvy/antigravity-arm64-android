package com.agy.bridge;

import android.content.Context;
import android.webkit.JavascriptInterface;

import com.agy.runtime.RuntimeManager;
import com.agy.shell.ShizukuBridge;
import com.agy.theme.ThemeManager;
import com.agy.ui.MainActivity;

import java.lang.ref.WeakReference;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * Minimal, low-privilege JavaScript bridge for the app UI. It is visible to
 * embedded frames, so shell, notification, and arbitrary URL capabilities must
 * not be exposed here. Native-only getters below are intentionally unannotated.
 */
public final class AndroidBridge {

    private final Context appContext;
    private final UiBridge ui = new UiBridge();
    private final ThemeBridge themeBridge;
    private final EngineBridge engine;
    private final EngineConfigJson config;
    private final String blobBridgeToken = createBlobBridgeToken();
    private volatile WeakReference<MainActivity> activityRef;

    public AndroidBridge(Context context, RuntimeManager runtime,
                         ShizukuBridge shizuku, ThemeManager theme) {
        this.appContext = context.getApplicationContext();
        this.themeBridge = new ThemeBridge(theme);
        this.engine = new EngineBridge(runtime);
        this.config = new EngineConfigJson(appContext, runtime, engine, shizuku, themeBridge);
    }

    /** Host activity, used to dismiss the native splash once the UI has painted. */
    public void setActivity(MainActivity activity) {
        this.activityRef = activity != null ? new WeakReference<MainActivity>(activity) : null;
        ui.setActivity(activity);
    }

    @JavascriptInterface
    public void onUiReady(String token) {
        if (matchesNativeBridgeToken(token)) {
            ui.onUiReady();
        }
    }

    @JavascriptInterface
    public void openDirectoryPicker() {
        final MainActivity act = activityRef != null ? activityRef.get() : MainActivity.activeActivity;
        if (act != null) {
            act.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    act.launchDirectoryPicker();
                }
            });
        }
    }

    @JavascriptInterface
    public void onUiError(String token, final String errorMessage) {
        if (matchesNativeBridgeToken(token)) {
            ui.onUiError(errorMessage);
        }
    }

    @JavascriptInterface
    public boolean setTheme(String mode) {
        return themeBridge.setTheme(mode);
    }

    @JavascriptInterface
    public boolean setThemeByUser(final String mode) {
        return themeBridge.setThemeByUser(mode);
    }

    @JavascriptInterface
    public void onVisualThemeChanged(String visual) {
        themeBridge.onVisualThemeChanged(visual);
    }

    @JavascriptInterface
    public String getTheme() {
        return themeBridge.getTheme();
    }

    /** Raw OS theme; backs the WebView prefers-color-scheme shim. */
    @JavascriptInterface
    public String getSystemTheme() {
        return themeBridge.getSystemTheme();
    }

    @JavascriptInterface
    public boolean isDesktopMode() {
        return ui.isDesktopMode();
    }

    @JavascriptInterface
    public void setDesktopMode(boolean enabled) {
        ui.setDesktopMode(enabled);
    }

    /** Returns the user's AI Provider, API Key, and Model configuration JSON. */
    @JavascriptInterface
    public String getAiConfig(String token) {
        if (!matchesNativeBridgeToken(token)) {
            return "{}";
        }
        return com.agy.ai.AiModelManager.getConfigJson(appContext);
    }

    /** Saves the user's AI configuration, writes ~/.antigravity/settings.json, and restarts the core engine. */
    @JavascriptInterface
    public boolean saveAiConfig(String token, String jsonConfig) {
        if (!matchesNativeBridgeToken(token)) {
            return false;
        }
        boolean saved = com.agy.ai.AiModelManager.saveConfigJson(appContext, jsonConfig);
        if (saved) {
            com.agy.core.CoreServerService.restartCore(appContext);
        }
        return saved;
    }

    /** Live-tests an API Key and fetches available models from the provider's endpoint. */
    @JavascriptInterface
    public String fetchAiModels(String token, String providerId, String baseUrl,
                                String apiKey, String wireProtocol) {
        if (!matchesNativeBridgeToken(token)) {
            return "{\"ok\":false,\"error\":\"Unauthorized bridge call\"}";
        }
        return com.agy.ai.AiModelManager.fetchModelsFromProvider(
                providerId, baseUrl, apiKey, wireProtocol);
    }

    /** Checks whether the core engine is ready after a configuration restart. */
    @JavascriptInterface
    public boolean checkEngineReady(String token) {
        if (!matchesNativeBridgeToken(token)) {
            return false;
        }
        return engine.isReady();
    }

    /** Returns true if Android native SpeechRecognizer or RecognizerIntent is available. */
    @JavascriptInterface
    public boolean isVoiceRecognitionAvailable() {
        return com.agy.voice.VoiceBridge.isRecognitionAvailable(appContext);
    }

    /** Starts native Android speech-to-text recognition and streams events to window.__onAgVoiceEvent. */
    @JavascriptInterface
    public boolean startVoiceRecognition(String token, String sessionId, boolean continuous, String lang) {
        if (!matchesNativeBridgeToken(token)) {
            return false;
        }
        final MainActivity act = activityRef != null ? activityRef.get() : MainActivity.activeActivity;
        if (act == null) {
            return false;
        }
        com.agy.voice.VoiceBridge.startListening(act, sessionId, continuous, lang);
        return true;
    }

    /** Stops active speech recognition and commits the final transcript. */
    @JavascriptInterface
    public void stopVoiceRecognition(String token, String sessionId) {
        if (!matchesNativeBridgeToken(token)) {
            return;
        }
        final MainActivity act = activityRef != null ? activityRef.get() : MainActivity.activeActivity;
        com.agy.voice.VoiceBridge.stopListening(act, sessionId);
    }

    /** Cancels active speech recognition without committing any transcript. */
    @JavascriptInterface
    public void cancelVoiceRecognition(String token, String sessionId) {
        if (!matchesNativeBridgeToken(token)) {
            return;
        }
        final MainActivity act = activityRef != null ? activityRef.get() : MainActivity.activeActivity;
        com.agy.voice.VoiceBridge.cancelListening(act, sessionId);
    }

    /** Fallback cloud audio transcription via configured Gemini / Groq / OpenAI API keys. */
    @JavascriptInterface
    public String transcribeAudio(String token, String base64Audio, String mimeType) {
        if (!matchesNativeBridgeToken(token)) {
            return "{\"ok\":false,\"error\":\"Unauthorized bridge call\"}";
        }
        return com.agy.ai.AiModelManager.transcribeAudio(appContext, base64Audio, mimeType);
    }

    /** Speaks text aloud using Android native TextToSpeech. */
    @JavascriptInterface
    public void speakText(String token, String text, String lang) {
        if (!matchesNativeBridgeToken(token)) {
            return;
        }
        com.agy.voice.VoiceBridge.speakText(appContext, text, lang);
    }

    /** Stops any active TextToSpeech utterance. */
    @JavascriptInterface
    public void stopSpeaking(String token) {
        if (!matchesNativeBridgeToken(token)) {
            return;
        }
        com.agy.voice.VoiceBridge.stopSpeaking();
    }

    /** Installs a local plugin folder under ~/.gemini/config/plugins/<uid> for Gateway/API Key mode. */
    @JavascriptInterface
    public String installLocalPlugin(String token, String uid, String name, String description) {
        if (!matchesNativeBridgeToken(token)) {
            return "{\"ok\":false,\"error\":\"Unauthorized bridge call\"}";
        }
        try {
            String safeUid = (uid == null ? "" : uid).replaceAll("[^a-zA-Z0-9._-]", "");
            if (safeUid.isEmpty()) {
                return "{\"ok\":false,\"error\":\"Invalid plugin uid\"}";
            }
            java.io.File pluginDir = new java.io.File(appContext.getFilesDir(), ".gemini/config/plugins/" + safeUid);
            if (!pluginDir.isDirectory() && !pluginDir.mkdirs()) {
                return "{\"ok\":false,\"error\":\"Cannot create plugin directory\"}";
            }
            org.json.JSONObject meta = new org.json.JSONObject();
            meta.put("uid", safeUid);
            meta.put("name", name != null && !name.isEmpty() ? name : safeUid);
            meta.put("description", description != null ? description : "");
            meta.put("version", "1.0.0");
            com.agy.util.AtomicFileWriter.writeText(
                    new java.io.File(pluginDir, "plugin.json"), meta.toString(2) + "\n");

            java.io.File skillDir = new java.io.File(pluginDir, "skills/" + safeUid);
            if (!skillDir.isDirectory()) {
                skillDir.mkdirs();
            }
            String skillMd = "---\nname: " + safeUid + "\ndescription: "
                    + (description != null ? description.replace("\n", " ") : safeUid)
                    + "\n---\n\n# " + (name != null ? name : safeUid) + "\n\n"
                    + (description != null ? description : "") + "\n";
            com.agy.util.AtomicFileWriter.writeText(new java.io.File(skillDir, "SKILL.md"), skillMd);
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":" + org.json.JSONObject.quote(e.getMessage()) + "}";
        }
    }

    /** Removes a local plugin folder under ~/.gemini/config/plugins/<uid>. */
    @JavascriptInterface
    public String removeLocalPlugin(String token, String uid) {
        if (!matchesNativeBridgeToken(token)) {
            return "{\"ok\":false,\"error\":\"Unauthorized bridge call\"}";
        }
        try {
            String safeUid = (uid == null ? "" : uid).replaceAll("[^a-zA-Z0-9._-]", "");
            if (safeUid.isEmpty()) {
                return "{\"ok\":false,\"error\":\"Invalid plugin uid\"}";
            }
            java.io.File pluginDir = new java.io.File(appContext.getFilesDir(), ".gemini/config/plugins/" + safeUid);
            deleteRecursive(pluginDir);
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":" + org.json.JSONObject.quote(e.getMessage()) + "}";
        }
    }

    private static void deleteRecursive(java.io.File f) {
        if (f == null || !f.exists()) return;
        java.io.File[] children = f.listFiles();
        if (children != null) {
            for (java.io.File c : children) {
                deleteRecursive(c);
            }
        }
        f.delete();
    }

    /** Triggers native Android tactile haptic feedback on UI interactions. */
    @JavascriptInterface
    public void performHapticFeedback(final String type) {
        final MainActivity act = activityRef != null ? activityRef.get() : MainActivity.activeActivity;
        if (act == null) {
            return;
        }
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.view.View decor = act.getWindow() != null ? act.getWindow().getDecorView() : null;
                    if (decor == null) {
                        return;
                    }
                    int feedbackConstant = android.view.HapticFeedbackConstants.VIRTUAL_KEY;
                    if ("long_press".equalsIgnoreCase(type)) {
                        feedbackConstant = android.view.HapticFeedbackConstants.LONG_PRESS;
                    } else if ("tap".equalsIgnoreCase(type) || "light".equalsIgnoreCase(type)) {
                        feedbackConstant = android.view.HapticFeedbackConstants.KEYBOARD_TAP;
                    }
                    decor.performHapticFeedback(feedbackConstant,
                            android.view.HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING);
                } catch (Throwable ignored) {
                }
            }
        });
    }

    /** Shows a short native Android toast message. */
    @JavascriptInterface
    public void showToast(final String message) {
        if (message == null || message.trim().isEmpty()) {
            return;
        }
        final MainActivity act = activityRef != null ? activityRef.get() : MainActivity.activeActivity;
        if (act == null) {
            return;
        }
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.widget.Toast.makeText(act, message, android.widget.Toast.LENGTH_SHORT).show();
                } catch (Throwable ignored) {
                }
            }
        });
    }

    // Native-only helpers used while preparing the trusted app document.
    public boolean isEngineReady() {
        return engine.isReady();
    }

    public int getEnginePort() {
        return engine.getPort();
    }

    public String getEngineBaseUrl() {
        return engine.getBaseUrl();
    }

    public String getCsrfToken() {
        return engine.getCsrfToken();
    }

    public String getConfig() {
        return config.get();
    }

    /** Native-only token inserted into the trusted top-level document. */
    public String getBlobBridgeToken() {
        return blobBridgeToken;
    }

    /** Saves a downloaded blob only for scripts holding the top-level document token. */
    @JavascriptInterface
    public void saveBlob(String token, String base64Data, String filename, String mimeType) {
        if (!matchesNativeBridgeToken(token)) {
            return;
        }
        final MainActivity act = activityRef != null ? activityRef.get() : MainActivity.activeActivity;
        if (act != null) {
            com.agy.ui.download.FileDownloader.handleBlobData(
                    act, base64Data, filename, mimeType);
        }
    }

    private boolean matchesNativeBridgeToken(String candidate) {
        if (candidate == null) {
            return false;
        }
        try {
            byte[] expected = blobBridgeToken.getBytes(Charset.forName("UTF-8"));
            byte[] actual = candidate.getBytes(Charset.forName("UTF-8"));
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String createBlobBridgeToken() {
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        char[] hex = "0123456789abcdef".toCharArray();
        char[] encoded = new char[random.length * 2];
        for (int i = 0; i < random.length; i++) {
            int value = random[i] & 0xff;
            encoded[i * 2] = hex[value >>> 4];
            encoded[i * 2 + 1] = hex[value & 0x0f];
        }
        return new String(encoded);
    }
}
