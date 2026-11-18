package com.agy.ai;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;
import android.util.Log;

import com.agy.BuildConfig;
import com.agy.util.AtomicFileWriter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;

/**
 * Manages AI Provider configurations, API Keys, and custom model catalogs.
 * Synchronizes user settings to $HOME/.antigravity/settings.json and injects
 * AGY_LLM_GATEWAY_* / GEMINI_API_KEY environment variables into language_server.
 */
public final class AiModelManager {

    private static final String TAG = "AiModelManager";
    private static final String PREFS_NAME = "agy_ai_models_prefs";
    private static final String KEY_CONFIG_JSON = "config_json_v1";

    private AiModelManager() {
    }

    public static synchronized JSONObject getConfig(Context context) {
        SharedPreferences prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_CONFIG_JSON, null);
        JSONObject defaults = buildDefaultConfig();
        if (TextUtils.isEmpty(raw)) {
            return defaults;
        }
        try {
            JSONObject saved = new JSONObject(raw);
            return mergeWithDefaults(defaults, saved);
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse saved AI config, using defaults: " + e.getMessage());
            return defaults;
        }
    }

    public static synchronized String getConfigJson(Context context) {
        return getConfig(context).toString();
    }

    public static synchronized boolean saveConfigJson(Context context, String jsonStr) {
        if (TextUtils.isEmpty(jsonStr)) {
            return false;
        }
        try {
            Context appContext = context.getApplicationContext();
            JSONObject incoming = new JSONObject(jsonStr);
            JSONObject merged = mergeWithDefaults(buildDefaultConfig(), incoming);
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_CONFIG_JSON, merged.toString()).commit();
            syncSettingsFile(appContext, merged);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to save AI config: " + e.getMessage());
            return false;
        }
    }

    /**
     * Writes $HOME/.antigravity/settings.json and injects environment variables
     * before language_server starts.
     */
    public static synchronized void applyEnvironment(Context context, Map<String, String> env) {
        try {
            Context appContext = context.getApplicationContext();
            JSONObject cfg = getConfig(appContext);
            syncSettingsFile(appContext, cfg);

            boolean enabled = cfg.optBoolean("enabled", false);
            if (!enabled) {
                env.remove("AGY_LLM_GATEWAY_URL");
                env.remove("AGY_LLM_GATEWAY_WIRE_PROTOCOL");
                env.remove("AGY_LLM_GATEWAY_API_KEY");
                env.remove("AGY_LLM_GATEWAY_HEADERS");
                env.remove("AGY_LLM_GATEWAY_MODELS");
                env.remove("GEMINI_API_KEY");
                return;
            }

            String activeProvider = cfg.optString("activeProvider", "gemini");
            JSONObject providers = cfg.optJSONObject("providers");
            if (providers == null) {
                return;
            }

            if ("multi".equals(activeProvider)) {
                int gwPort = resolveGatewayPort(appContext);
                String localUrl = "http://127.0.0.1:" + gwPort + "/v1";
                env.put("AGY_LLM_GATEWAY_URL", localUrl);
                env.put("AGY_LLM_GATEWAY_WIRE_PROTOCOL", "openai");
                env.put("AGY_LLM_GATEWAY_API_KEY", "agy-local-multi-router");
                env.remove("GEMINI_API_KEY");
                Log.i(TAG, "Configured Multi-Provider AI Gateway at " + localUrl);
                return;
            }

            JSONObject prov = providers.optJSONObject(activeProvider);
            if (prov == null) {
                return;
            }

            String apiKey = prov.optString("apiKey", "").trim();
            String baseUrl = prov.optString("baseUrl", "").trim();
            String wireProtocol = prov.optString("wireProtocol", "openai").trim();
            if (!"genai".equals(wireProtocol) && !"openai".equals(wireProtocol)) {
                wireProtocol = "openai";
            }

            if (baseUrl.endsWith("/")) {
                baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            }

            if (!baseUrl.isEmpty()) {
                if ("genai".equals(wireProtocol)) {
                    env.put("AGY_LLM_GATEWAY_URL", baseUrl);
                    env.put("AGY_LLM_GATEWAY_WIRE_PROTOCOL", "genai");
                } else {
                    int gwPort = resolveGatewayPort(appContext);
                    String localUrl = "http://127.0.0.1:" + gwPort + "/v1";
                    env.put("AGY_LLM_GATEWAY_URL", localUrl);
                    env.put("AGY_LLM_GATEWAY_WIRE_PROTOCOL", "openai");
                }
            }
            if (!apiKey.isEmpty()) {
                if ("gemini".equals(activeProvider) || "genai".equals(wireProtocol)) {
                    env.put("AGY_LLM_GATEWAY_API_KEY", apiKey);
                    env.put("GEMINI_API_KEY", apiKey);
                } else {
                    env.put("AGY_LLM_GATEWAY_API_KEY", "agy-local-router");
                    env.remove("GEMINI_API_KEY");
                }
            } else {
                env.remove("AGY_LLM_GATEWAY_API_KEY");
                env.remove("GEMINI_API_KEY");
            }
            Log.i(TAG, "Configured AI Provider: " + activeProvider
                    + " (" + wireProtocol + ") -> " + baseUrl);
        } catch (Exception e) {
            Log.w(TAG, "Failed to apply AI environment: " + e.getMessage());
        }
    }

    /**
     * Synchronizes $HOME/.antigravity/settings.json for language_server Tier 1 model discovery
     * and gateway configuration.
     */
    public static synchronized void syncSettingsFile(Context context, JSONObject cfg) {
        try {
            File homeDir = context.getFilesDir();
            File agyDir = new File(homeDir, ".antigravity");
            if (!agyDir.exists() && !agyDir.mkdirs()) {
                Log.w(TAG, "Could not create " + agyDir.getAbsolutePath());
                return;
            }
            File settingsFile = new File(agyDir, "settings.json");

            boolean enabled = cfg.optBoolean("enabled", false);
            if (!enabled) {
                if (settingsFile.isFile()) {
                    // Write disabled gateway state so language_server reverts to default OAuth
                    JSONObject disabledRoot = new JSONObject();
                    JSONObject gw = new JSONObject();
                    gw.put("enabled", false);
                    disabledRoot.put("gateway", gw);
                    AtomicFileWriter.writeText(settingsFile, disabledRoot.toString(2) + "\n");
                }
                return;
            }

            String activeProvider = cfg.optString("activeProvider", "gemini");
            JSONObject providers = cfg.optJSONObject("providers");
            if (providers == null) {
                return;
            }

            JSONObject settingsRoot = new JSONObject();
            JSONObject gatewayObj = new JSONObject();
            JSONObject headersObj = new JSONObject();
            JSONArray modelList = new JSONArray();

            if ("multi".equals(activeProvider)) {
                int gwPort = resolveGatewayPort(context);
                gatewayObj.put("enabled", true);
                gatewayObj.put("url", "http://127.0.0.1:" + gwPort + "/v1");
                gatewayObj.put("wireProtocol", "openai");
                gatewayObj.put("routeWebFetch", false);
                headersObj.put("Authorization", "Bearer agy-local-multi-router");
                gatewayObj.put("customHeaders", headersObj);

                String[] order = new String[]{
                        "gemini", "openai", "anthropic", "openrouter",
                        "deepseek", "groq", "xai", "mistral", "custom"
                };
                for (String pid : order) {
                    JSONObject p = providers.optJSONObject(pid);
                    if (p == null) continue;
                    String key = p.optString("apiKey", "").trim();
                    if (key.isEmpty() && !"custom".equals(pid)) continue;
                    String pLabel = p.optString("name", pid);
                    JSONArray mArr = p.optJSONArray("models");
                    if (mArr == null) continue;
                    for (int i = 0; i < mArr.length(); i++) {
                        JSONObject m = mArr.optJSONObject(i);
                        if (m == null || !m.optBoolean("enabled", true)) continue;
                        String rawId = m.optString("modelId", "").trim();
                        if (rawId.isEmpty()) continue;
                        String disp = m.optString("displayName", rawId).trim();
                        JSONObject entry = buildGatewayModelEntry(
                                pid + "::" + rawId,
                                disp + " [" + pLabel + "]",
                                m.optBoolean("supportsThinking", false),
                                m.optLong("maxTokens", 128000L),
                                m.optLong("maxOutputTokens", 16384L)
                        );
                        modelList.put(entry);
                    }
                }
            } else {
                JSONObject prov = providers.optJSONObject(activeProvider);
                if (prov == null) {
                    return;
                }
                String apiKey = prov.optString("apiKey", "").trim();
                String baseUrl = prov.optString("baseUrl", "").trim();
                if (baseUrl.endsWith("/")) {
                    baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
                }
                String wireProtocol = prov.optString("wireProtocol", "openai").trim();
                if (!"genai".equals(wireProtocol) && !"openai".equals(wireProtocol)) {
                    wireProtocol = "openai";
                }

                gatewayObj.put("enabled", true);
                if ("genai".equals(wireProtocol)) {
                    gatewayObj.put("url", baseUrl);
                    gatewayObj.put("wireProtocol", "genai");
                    if (!apiKey.isEmpty()) {
                        headersObj.put("x-goog-api-key", apiKey);
                    }
                    JSONObject extraHeaders = prov.optJSONObject("customHeaders");
                    if (extraHeaders != null) {
                        Iterator<String> keys = extraHeaders.keys();
                        while (keys.hasNext()) {
                            String k = keys.next();
                            String v = extraHeaders.optString(k, "");
                            if (!k.isEmpty() && !v.isEmpty()) {
                                headersObj.put(k, v);
                            }
                        }
                    }
                } else {
                    // Route OpenAI-compatible traffic through local SystemGatewayServer so
                    // tool_call/tool_output pairing and request payloads are sanitized.
                    int gwPort = resolveGatewayPort(context);
                    gatewayObj.put("url", "http://127.0.0.1:" + gwPort + "/v1");
                    gatewayObj.put("wireProtocol", "openai");
                    headersObj.put("Authorization", "Bearer agy-local-router");
                }
                gatewayObj.put("routeWebFetch", false);
                gatewayObj.put("customHeaders", headersObj);

                JSONArray mArr = prov.optJSONArray("models");
                if (mArr != null) {
                    for (int i = 0; i < mArr.length(); i++) {
                        JSONObject m = mArr.optJSONObject(i);
                        if (m == null || !m.optBoolean("enabled", true)) continue;
                        String modelId = m.optString("modelId", "").trim();
                        if (modelId.isEmpty()) continue;
                        String displayName = m.optString("displayName", modelId).trim();
                        JSONObject entry = buildGatewayModelEntry(
                                modelId,
                                displayName,
                                m.optBoolean("supportsThinking", false),
                                m.optLong("maxTokens", 128000L),
                                m.optLong("maxOutputTokens", 16384L)
                        );
                        modelList.put(entry);
                    }
                }
            }

            // Ensure at least one fallback model entry exists so Tier 1 validation succeeds
            if (modelList.length() == 0) {
                modelList.put(buildGatewayModelEntry(
                        "gemini-2.5-flash", "Gemini 2.5 Flash", true, 1048576L, 65536L));
            }

            JSONObject modelsObj = new JSONObject();
            modelsObj.put("list", modelList);

            settingsRoot.put("gateway", gatewayObj);
            settingsRoot.put("models", modelsObj);

            AtomicFileWriter.writeText(settingsFile, settingsRoot.toString(2) + "\n");
            Log.i(TAG, "Synced ~/.antigravity/settings.json with " + modelList.length() + " model(s)");
        } catch (Exception e) {
            Log.w(TAG, "Failed to sync settings.json: " + e.getMessage());
        }
    }

    private static JSONObject buildGatewayModelEntry(String modelId, String displayName,
                                                     boolean supportsThinking,
                                                     long maxTokens, long maxOutputTokens) throws Exception {
        JSONObject entry = new JSONObject();
        entry.put("modelId", modelId);
        entry.put("displayName", displayName.isEmpty() ? modelId : displayName);
        entry.put("supportsThinking", supportsThinking);
        entry.put("maxTokens", maxTokens > 0 ? maxTokens : 128000L);
        entry.put("maxOutputTokens", maxOutputTokens > 0 ? maxOutputTokens : 16384L);
        if (supportsThinking) {
            entry.put("thinkingBudget", 16384L);
        }
        JSONObject mime = new JSONObject();
        mime.put("text/plain", true);
        mime.put("image/png", true);
        mime.put("image/jpeg", true);
        mime.put("image/webp", true);
        mime.put("application/pdf", true);
        entry.put("supportedMimeTypes", mime);
        return entry;
    }

    private static int resolveGatewayPort(Context context) {
        try {
            File pFile = new File(context.getFilesDir(), "logs/gateway.port");
            if (pFile.isFile()) {
                try ( java.io.FileInputStream fis = new java.io.FileInputStream(pFile)) {
                    byte[] buf = new byte[32];
                    int n = fis.read(buf);
                    if (n > 0) {
                        int parsed = Integer.parseInt(new String(buf, 0, n, StandardCharsets.UTF_8).trim());
                        if (parsed > 0) return parsed;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return BuildConfig.GATEWAY_PORT;
    }

    /**
     * Tests an API Key and fetches available models from the provider's endpoint.
     */
    public static String fetchModelsFromProvider(String providerId, String baseUrl,
                                                 String apiKey, String wireProtocol) {
        JSONObject result = new JSONObject();
        HttpURLConnection conn = null;
        try {
            String cleanUrl = baseUrl != null ? baseUrl.trim() : "";
            while (cleanUrl.endsWith("/")) {
                cleanUrl = cleanUrl.substring(0, cleanUrl.length() - 1);
            }
            if (cleanUrl.isEmpty()) {
                result.put("ok", false);
                result.put("error", "Base URL cannot be empty");
                return result.toString();
            }

            String targetUrl;
            boolean isGenAi = "genai".equalsIgnoreCase(wireProtocol) || "gemini".equalsIgnoreCase(providerId);
            if (isGenAi && !cleanUrl.endsWith("/openai")) {
                targetUrl = cleanUrl + "/v1beta/models?pageSize=100";
            } else if (cleanUrl.endsWith("/v1") || cleanUrl.endsWith("/openai") || cleanUrl.endsWith("/v1beta")) {
                targetUrl = cleanUrl + "/models";
            } else {
                targetUrl = cleanUrl + "/v1/models";
            }

            conn = (HttpURLConnection) new URL(targetUrl).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "Antigravity-Android/2.0");

            String key = apiKey != null ? apiKey.trim() : "";
            if (!key.isEmpty()) {
                if (isGenAi && !cleanUrl.endsWith("/openai")) {
                    conn.setRequestProperty("x-goog-api-key", key);
                } else if ("anthropic".equalsIgnoreCase(providerId)) {
                    conn.setRequestProperty("x-api-key", key);
                    conn.setRequestProperty("anthropic-version", "2023-06-01");
                    conn.setRequestProperty("Authorization", "Bearer " + key);
                } else {
                    conn.setRequestProperty("Authorization", "Bearer " + key);
                }
            }

            int status = conn.getResponseCode();
            InputStream in = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            String body = readStreamToString(in);

            if (status < 200 || status >= 300) {
                result.put("ok", false);
                result.put("status", status);
                result.put("error", "HTTP " + status + ": " + (body.length() > 240 ? body.substring(0, 240) : body));
                return result.toString();
            }

            JSONObject json = new JSONObject(body);
            JSONArray discovered = new JSONArray();

            if (json.has("models") && json.optJSONArray("models") != null) {
                // Gemini /v1beta/models format
                JSONArray arr = json.optJSONArray("models");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.optJSONObject(i);
                    if (item == null) continue;
                    String name = item.optString("name", "");
                    if (name.startsWith("models/")) {
                        name = name.substring("models/".length());
                    }
                    if (name.isEmpty() || isNonChatModel(name)) continue;
                    JSONArray methods = item.optJSONArray("supportedGenerationMethods");
                    if (methods != null) {
                        boolean supportsGen = false;
                        for (int m = 0; m < methods.length(); m++) {
                            String method = methods.optString(m, "");
                            if ("generateContent".equals(method) || "streamGenerateContent".equals(method)) {
                                supportsGen = true;
                                break;
                            }
                        }
                        if (!supportsGen) continue;
                    }
                    String disp = item.optString("displayName", name);
                    boolean thinking = item.optBoolean("thinking", false)
                            || name.contains("2.5") || name.contains("3.") || name.contains("thinking");
                    JSONObject mObj = new JSONObject();
                    mObj.put("modelId", name);
                    mObj.put("displayName", disp);
                    mObj.put("supportsThinking", thinking);
                    mObj.put("enabled", true);
                    mObj.put("maxTokens", item.optLong("inputTokenLimit", 1048576L));
                    mObj.put("maxOutputTokens", item.optLong("outputTokenLimit", 65536L));
                    discovered.put(mObj);
                }
            } else if (json.has("data") && json.optJSONArray("data") != null) {
                // OpenAI /v1/models format
                JSONArray arr = json.optJSONArray("data");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.optJSONObject(i);
                    if (item == null) continue;
                    String id = item.optString("id", "").trim();
                    if (id.isEmpty() || isNonChatModel(id)) continue;
                    String disp = item.optString("name", item.optString("display_name", id));
                    boolean thinking = id.contains("o1") || id.contains("o3") || id.contains("o4")
                            || id.contains("reasoner") || id.contains("-r1") || id.contains("qwq")
                            || id.contains("thinking") || id.contains("claude-3-7")
                            || id.contains("claude-sonnet-4") || id.contains("claude-opus-4")
                            || id.contains("gemini-2.5");
                    JSONObject mObj = new JSONObject();
                    mObj.put("modelId", id);
                    mObj.put("displayName", disp);
                    mObj.put("supportsThinking", thinking);
                    mObj.put("enabled", i < 12); // enable first 12 by default so catalog isn't flooded
                    mObj.put("maxTokens", item.optLong("context_length", 128000L));
                    mObj.put("maxOutputTokens", 16384L);
                    discovered.put(mObj);
                }
            }

            result.put("ok", true);
            result.put("models", discovered);
            return result.toString();
        } catch (Exception e) {
            try {
                result.put("ok", false);
                result.put("error", e.getMessage() != null ? e.getMessage() : e.toString());
            } catch (Exception ignored) {
            }
            return result.toString();
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /**
     * Multi-Provider local router for /v1/chat/completions in SystemGatewayServer.
     * Routes requests based on the "provider::modelId" prefix or matching provider model catalog.
     */
    public static void proxyChatCompletions(Context context, String requestBody, OutputStream clientOut) {
        HttpURLConnection conn = null;
        try {
            JSONObject reqJson = new JSONObject(requestBody);
            String requestedModel = reqJson.optString("model", "");
            JSONObject cfg = getConfig(context);
            JSONObject providers = cfg.optJSONObject("providers");
            if (providers == null) {
                writeHttpJsonError(clientOut, 500, "No AI providers configured");
                return;
            }

            String targetProviderId = null;
            String actualModelId = requestedModel;
            if (requestedModel.contains("::")) {
                int idx = requestedModel.indexOf("::");
                targetProviderId = requestedModel.substring(0, idx);
                actualModelId = requestedModel.substring(idx + 2);
                reqJson.put("model", actualModelId);
            } else {
                // Find which provider has this modelId enabled
                Iterator<String> keys = providers.keys();
                while (keys.hasNext()) {
                    String pid = keys.next();
                    JSONObject p = providers.optJSONObject(pid);
                    if (p == null || p.optString("apiKey", "").trim().isEmpty()) continue;
                    JSONArray mArr = p.optJSONArray("models");
                    if (mArr == null) continue;
                    for (int i = 0; i < mArr.length(); i++) {
                        JSONObject m = mArr.optJSONObject(i);
                        if (m != null && actualModelId.equals(m.optString("modelId"))) {
                            targetProviderId = pid;
                            break;
                        }
                    }
                    if (targetProviderId != null) break;
                }
            }

            if (targetProviderId == null) {
                targetProviderId = cfg.optString("activeProvider", "openai");
                if ("multi".equals(targetProviderId)) {
                    targetProviderId = "openai";
                }
            }

            JSONObject prov = providers.optJSONObject(targetProviderId);
            if (prov == null) {
                writeHttpJsonError(clientOut, 400, "Unknown AI provider: " + targetProviderId);
                return;
            }

            String apiKey = prov.optString("apiKey", "").trim();
            String baseUrl = prov.optString("baseUrl", "").trim();
            while (baseUrl.endsWith("/")) {
                baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            }

            String targetEndpoint;
            if ("gemini".equals(targetProviderId) && !baseUrl.contains("/openai")) {
                // Use Gemini's official OpenAI-compatible endpoint when proxying via Multi-Provider
                targetEndpoint = baseUrl + "/v1beta/openai/chat/completions";
            } else if (baseUrl.endsWith("/v1") || baseUrl.endsWith("/openai")) {
                targetEndpoint = baseUrl + "/chat/completions";
            } else {
                targetEndpoint = baseUrl + "/v1/chat/completions";
            }

            sanitizeOpenAiMessages(reqJson);

            byte[] outBytes = reqJson.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(targetEndpoint).openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(120000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", reqJson.optBoolean("stream", false)
                    ? "text/event-stream" : "application/json");

            if (!apiKey.isEmpty()) {
                if ("anthropic".equals(targetProviderId)) {
                    conn.setRequestProperty("x-api-key", apiKey);
                    conn.setRequestProperty("anthropic-version", "2023-06-01");
                    conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                } else if ("openrouter".equals(targetProviderId)) {
                    conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                    conn.setRequestProperty("HTTP-Referer", "https://antigravity.google");
                    conn.setRequestProperty("X-Title", "Antigravity Android");
                } else {
                    conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                }
            }

            JSONObject extraHeaders = prov.optJSONObject("customHeaders");
            if (extraHeaders != null) {
                Iterator<String> hKeys = extraHeaders.keys();
                while (hKeys.hasNext()) {
                    String k = hKeys.next();
                    String v = extraHeaders.optString(k, "");
                    if (!k.isEmpty() && !v.isEmpty()) {
                        conn.setRequestProperty(k, v);
                    }
                }
            }

            try (OutputStream os = conn.getOutputStream()) {
                os.write(outBytes);
                os.flush();
            }

            int status = conn.getResponseCode();
            String contentType = conn.getContentType();
            if (contentType == null || contentType.isEmpty()) {
                contentType = "application/json; charset=utf-8";
            }

            String statusLine = "HTTP/1.1 " + status + " " + (status >= 200 && status < 300 ? "OK" : "Error") + "\r\n"
                    + "Content-Type: " + contentType + "\r\n"
                    + "Cache-Control: no-cache\r\n"
                    + "Connection: close\r\n\r\n";
            clientOut.write(statusLine.getBytes(StandardCharsets.UTF_8));
            clientOut.flush();

            InputStream in = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            if (in != null) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) != -1) {
                    clientOut.write(buf, 0, n);
                    clientOut.flush();
                }
                in.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "proxyChatCompletions error: " + e.getMessage());
            try {
                writeHttpJsonError(clientOut, 502, "Gateway proxy error: " + e.getMessage());
            } catch (Exception ignored) {
            }
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /**
     * Repairs OpenAI chat/completions `messages` arrays where an assistant `tool_calls` entry
     * lacks a matching `role: "tool"` output (e.g. after interrupted/errored tool execution),
     * preventing HTTP 400 "No tool output found for function call ..." errors.
     */
    private static void sanitizeOpenAiMessages(JSONObject reqJson) {
        try {
            JSONArray messages = reqJson.optJSONArray("messages");
            if (messages == null || messages.length() == 0) {
                return;
            }
            JSONArray sanitized = new JSONArray();
            java.util.LinkedHashSet<String> pendingCallIds = new java.util.LinkedHashSet<>();

            for (int i = 0; i < messages.length(); i++) {
                JSONObject msg = messages.optJSONObject(i);
                if (msg == null) continue;
                String role = msg.optString("role", "");

                if ("tool".equals(role)) {
                    String tcId = msg.optString("tool_call_id", "").trim();
                    if (tcId.isEmpty() || !pendingCallIds.contains(tcId)) {
                        continue;
                    }
                    pendingCallIds.remove(tcId);
                    if (!msg.has("content") || msg.isNull("content") || msg.optString("content", "").isEmpty()) {
                        msg.put("content", "(no output)");
                    }
                    sanitized.put(msg);
                    continue;
                }

                if (!pendingCallIds.isEmpty()) {
                    for (String missingId : pendingCallIds) {
                        JSONObject synthetic = new JSONObject();
                        synthetic.put("role", "tool");
                        synthetic.put("tool_call_id", missingId);
                        synthetic.put("content", "Tool execution did not return output (interrupted or failed).");
                        sanitized.put(synthetic);
                    }
                    pendingCallIds.clear();
                }

                if ("assistant".equals(role) && msg.has("tool_calls")) {
                    JSONArray tcs = msg.optJSONArray("tool_calls");
                    if (tcs == null || tcs.length() == 0) {
                        msg.remove("tool_calls");
                    } else {
                        for (int j = 0; j < tcs.length(); j++) {
                            JSONObject tc = tcs.optJSONObject(j);
                            if (tc == null) continue;
                            String id = tc.optString("id", "").trim();
                            if (!id.isEmpty()) {
                                pendingCallIds.add(id);
                            }
                            JSONObject fn = tc.optJSONObject("function");
                            if (fn != null && (!fn.has("arguments") || fn.isNull("arguments") || fn.optString("arguments", "").isEmpty())) {
                                fn.put("arguments", "{}");
                            }
                        }
                    }
                }
                sanitized.put(msg);
            }

            if (!pendingCallIds.isEmpty()) {
                for (String missingId : pendingCallIds) {
                    JSONObject synthetic = new JSONObject();
                    synthetic.put("role", "tool");
                    synthetic.put("tool_call_id", missingId);
                    synthetic.put("content", "Tool execution did not return output (interrupted or failed).");
                    sanitized.put(synthetic);
                }
                pendingCallIds.clear();
            }

            reqJson.put("messages", sanitized);
        } catch (Exception e) {
            Log.w(TAG, "sanitizeOpenAiMessages warning: " + e.getMessage());
        }
    }

    /** Builds an OpenAI-compatible /v1/models list from configured local models. */
    public static String buildLocalModelsListJson(Context context) {
        JSONObject root = new JSONObject();
        JSONArray data = new JSONArray();
        try {
            root.put("object", "list");
            JSONObject cfg = getConfig(context);
            String activeProvider = cfg.optString("activeProvider", "gemini");
            JSONObject providers = cfg.optJSONObject("providers");
            if (providers != null) {
                if ("multi".equals(activeProvider)) {
                    Iterator<String> keys = providers.keys();
                    while (keys.hasNext()) {
                        String pid = keys.next();
                        JSONObject p = providers.optJSONObject(pid);
                        if (p == null) continue;
                        if (p.optString("apiKey", "").trim().isEmpty() && !"custom".equals(pid)) continue;
                        JSONArray mArr = p.optJSONArray("models");
                        if (mArr == null) continue;
                        for (int i = 0; i < mArr.length(); i++) {
                            JSONObject m = mArr.optJSONObject(i);
                            if (m == null || !m.optBoolean("enabled", true)) continue;
                            String rawId = m.optString("modelId", "").trim();
                            if (rawId.isEmpty()) continue;
                            JSONObject item = new JSONObject();
                            item.put("id", pid + "::" + rawId);
                            item.put("object", "model");
                            item.put("owned_by", pid);
                            data.put(item);
                        }
                    }
                } else {
                    JSONObject p = providers.optJSONObject(activeProvider);
                    if (p != null) {
                        JSONArray mArr = p.optJSONArray("models");
                        if (mArr != null) {
                            for (int i = 0; i < mArr.length(); i++) {
                                JSONObject m = mArr.optJSONObject(i);
                                if (m == null || !m.optBoolean("enabled", true)) continue;
                                String rawId = m.optString("modelId", "").trim();
                                if (rawId.isEmpty()) continue;
                                JSONObject item = new JSONObject();
                                item.put("id", rawId);
                                item.put("object", "model");
                                item.put("owned_by", activeProvider);
                                data.put(item);
                            }
                        }
                    }
                }
            }
            root.put("data", data);
        } catch (Exception ignored) {
        }
        return root.toString();
    }

    /**
     * Transcribes base64-encoded audio using configured AI provider API keys
     * (Groq Whisper, OpenAI Whisper, or Google Gemini multimodal generateContent).
     */
    public static String transcribeAudio(Context context, String base64Audio, String mimeType) {
        JSONObject res = new JSONObject();
        try {
            if (TextUtils.isEmpty(base64Audio)) {
                res.put("ok", false);
                res.put("error", "Empty audio data");
                return res.toString();
            }
            JSONObject cfg = getConfig(context);
            JSONObject providers = cfg.optJSONObject("providers");
            if (providers == null) {
                res.put("ok", false);
                res.put("error", "AI provider configuration not found");
                return res.toString();
            }

            // 1. Check Gemini API Key first (supports audio/wav, audio/webm, audio/ogg natively)
            JSONObject gemini = providers.optJSONObject("gemini");
            String geminiKey = gemini != null ? gemini.optString("apiKey", "").trim() : "";
            if (!geminiKey.isEmpty()) {
                String base = gemini.optString("baseUrl", "https://generativelanguage.googleapis.com").trim();
                if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
                String text = transcribeViaGemini(base, geminiKey, base64Audio,
                        TextUtils.isEmpty(mimeType) ? "audio/wav" : mimeType);
                if (text != null) {
                    res.put("ok", true);
                    res.put("text", text);
                    return res.toString();
                }
            }

            // 2. Check Groq API Key (whisper-large-v3-turbo)
            JSONObject groq = providers.optJSONObject("groq");
            String groqKey = groq != null ? groq.optString("apiKey", "").trim() : "";
            if (!groqKey.isEmpty()) {
                String base = groq.optString("baseUrl", "https://api.groq.com/openai/v1").trim();
                if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
                String text = transcribeViaWhisper(base + "/audio/transcriptions",
                        groqKey, "whisper-large-v3-turbo", base64Audio, mimeType);
                if (text != null) {
                    res.put("ok", true);
                    res.put("text", text);
                    return res.toString();
                }
            }

            // 3. Check OpenAI API Key (whisper-1)
            JSONObject openai = providers.optJSONObject("openai");
            String openaiKey = openai != null ? openai.optString("apiKey", "").trim() : "";
            if (!openaiKey.isEmpty()) {
                String base = openai.optString("baseUrl", "https://api.openai.com/v1").trim();
                if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
                String text = transcribeViaWhisper(base + "/audio/transcriptions",
                        openaiKey, "whisper-1", base64Audio, mimeType);
                if (text != null) {
                    res.put("ok", true);
                    res.put("text", text);
                    return res.toString();
                }
            }

            res.put("ok", false);
            res.put("error", "Device speech recognition is unavailable and no Gemini/Groq/OpenAI API key is configured.");
        } catch (Exception e) {
            try {
                res.put("ok", false);
                res.put("error", e.getMessage() != null ? e.getMessage() : "Failed to transcribe audio");
            } catch (Exception ignored) {
            }
        }
        return res.toString();
    }

    private static String transcribeViaGemini(String baseUrl, String apiKey,
                                              String base64Audio, String mimeType) {
        HttpURLConnection conn = null;
        try {
            String endpoint = baseUrl.endsWith("/v1beta")
                    ? baseUrl + "/models/gemini-2.5-flash:generateContent"
                    : baseUrl + "/v1beta/models/gemini-2.5-flash:generateContent";
            JSONObject payload = new JSONObject();
            JSONArray contents = new JSONArray();
            JSONObject userTurn = new JSONObject();
            JSONArray parts = new JSONArray();

            JSONObject inlinePart = new JSONObject();
            JSONObject inlineData = new JSONObject();
            inlineData.put("mimeType", mimeType.split(";")[0].trim());
            inlineData.put("data", base64Audio);
            inlinePart.put("inlineData", inlineData);
            parts.put(inlinePart);

            JSONObject promptPart = new JSONObject();
            promptPart.put("text", "Transcribe the spoken words in this audio accurately. Output ONLY the raw transcribed text with no extra commentary, no markdown, and no quotes. If there is no speech, output an empty string.");
            parts.put(promptPart);

            userTurn.put("parts", parts);
            contents.put(userTurn);
            payload.put("contents", contents);

            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(endpoint).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("x-goog-api-key", apiKey);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
                os.flush();
            }
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                String resp = readStreamToString(conn.getInputStream());
                JSONObject json = new JSONObject(resp);
                JSONArray cands = json.optJSONArray("candidates");
                if (cands != null && cands.length() > 0) {
                    JSONObject content = cands.optJSONObject(0).optJSONObject("content");
                    if (content != null) {
                        JSONArray rParts = content.optJSONArray("parts");
                        if (rParts != null && rParts.length() > 0) {
                            return rParts.optJSONObject(0).optString("text", "").trim();
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "transcribeViaGemini failed: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static String transcribeViaWhisper(String urlStr, String apiKey, String model,
                                               String base64Audio, String mimeType) {
        HttpURLConnection conn = null;
        try {
            byte[] audioBytes = android.util.Base64.decode(base64Audio, android.util.Base64.DEFAULT);
            String boundary = "----AgyVoiceBoundary" + System.currentTimeMillis();
            String ext = (mimeType != null && mimeType.contains("webm")) ? "webm" : "wav";
            String cleanMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType.split(";")[0].trim() : "audio/wav";

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            String part1 = "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"file\"; filename=\"speech." + ext + "\"\r\n"
                    + "Content-Type: " + cleanMime + "\r\n\r\n";
            baos.write(part1.getBytes(StandardCharsets.UTF_8));
            baos.write(audioBytes);
            String part2 = "\r\n--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"model\"\r\n\r\n"
                    + model + "\r\n"
                    + "--" + boundary + "--\r\n";
            baos.write(part2.getBytes(StandardCharsets.UTF_8));

            byte[] body = baos.toByteArray();
            conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
                os.flush();
            }
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                String resp = readStreamToString(conn.getInputStream());
                JSONObject json = new JSONObject(resp);
                return json.optString("text", "").trim();
            }
        } catch (Exception e) {
            Log.w(TAG, "transcribeViaWhisper failed: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static void writeHttpJsonError(OutputStream out, int status, String msg) throws Exception {
        JSONObject err = new JSONObject();
        JSONObject inner = new JSONObject();
        inner.put("message", msg);
        inner.put("type", "gateway_error");
        err.put("error", inner);
        byte[] bytes = err.toString().getBytes(StandardCharsets.UTF_8);
        String header = "HTTP/1.1 " + status + " Error\r\n"
                + "Content-Type: application/json; charset=utf-8\r\n"
                + "Content-Length: " + bytes.length + "\r\n"
                + "Connection: close\r\n\r\n";
        out.write(header.getBytes(StandardCharsets.UTF_8));
        out.write(bytes);
        out.flush();
    }

    private static boolean isNonChatModel(String id) {
        String lower = id.toLowerCase();
        return lower.contains("embedding") || lower.contains("whisper")
                || lower.contains("tts") || lower.contains("moderation")
                || lower.contains("dall-e") || lower.contains("imagen")
                || lower.contains("text-embedding") || lower.contains("aqa");
    }

    private static String readStreamToString(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream is = in; ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            return baos.toString("UTF-8");
        }
    }

    private static JSONObject mergeWithDefaults(JSONObject defaults, JSONObject saved) {
        try {
            if (saved.has("enabled")) {
                defaults.put("enabled", saved.optBoolean("enabled", false));
            }
            if (saved.has("activeProvider")) {
                defaults.put("activeProvider", saved.optString("activeProvider", "gemini"));
            }
            JSONObject defProviders = defaults.optJSONObject("providers");
            JSONObject savedProviders = saved.optJSONObject("providers");
            if (defProviders != null && savedProviders != null) {
                Iterator<String> keys = savedProviders.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    JSONObject sProv = savedProviders.optJSONObject(k);
                    if (sProv == null) continue;
                    JSONObject dProv = defProviders.optJSONObject(k);
                    if (dProv == null) {
                        defProviders.put(k, sProv);
                        continue;
                    }
                    if (sProv.has("apiKey")) {
                        dProv.put("apiKey", sProv.optString("apiKey", ""));
                    }
                    if (sProv.has("baseUrl") && !sProv.optString("baseUrl", "").trim().isEmpty()) {
                        dProv.put("baseUrl", sProv.optString("baseUrl", ""));
                    }
                    if (sProv.has("wireProtocol") && !sProv.optString("wireProtocol", "").trim().isEmpty()) {
                        dProv.put("wireProtocol", sProv.optString("wireProtocol", "openai"));
                    }
                    if (sProv.has("models") && sProv.optJSONArray("models") != null
                            && sProv.optJSONArray("models").length() > 0) {
                        dProv.put("models", sProv.optJSONArray("models"));
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "mergeWithDefaults error: " + e.getMessage());
        }
        return defaults;
    }

    private static JSONObject buildDefaultConfig() {
        JSONObject root = new JSONObject();
        try {
            root.put("enabled", false);
            root.put("activeProvider", "gemini");

            JSONObject providers = new JSONObject();

            // 1. Google Gemini API
            providers.put("gemini", makeProvider(
                    "Google Gemini API",
                    "Use an API Key from Google AI Studio (aistudio.google.com)",
                    "https://generativelanguage.googleapis.com",
                    "genai",
                    new JSONObject[]{
                            makeModel("gemini-2.5-pro", "Gemini 2.5 Pro", true, true, 1048576L, 65536L),
                            makeModel("gemini-2.5-flash", "Gemini 2.5 Flash", true, true, 1048576L, 65536L),
                            makeModel("gemini-2.5-flash-lite-preview-06-17", "Gemini 2.5 Flash-Lite", true, true, 1048576L, 65536L),
                            makeModel("gemini-2.0-flash", "Gemini 2.0 Flash", false, true, 1048576L, 8192L)
                    }
            ));

            // 2. OpenAI
            providers.put("openai", makeProvider(
                    "OpenAI",
                    "GPT-4.1, GPT-4o, o3, and o4-mini using your OpenAI API Key",
                    "https://api.openai.com/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("gpt-4.1", "GPT-4.1", false, true, 1047576L, 32768L),
                            makeModel("gpt-4.1-mini", "GPT-4.1 Mini", false, true, 1047576L, 32768L),
                            makeModel("gpt-4o", "GPT-4o", false, true, 128000L, 16384L),
                            makeModel("o4-mini", "OpenAI o4-mini (Reasoning)", true, true, 200000L, 100000L),
                            makeModel("o3", "OpenAI o3 (Reasoning)", true, true, 200000L, 100000L)
                    }
            ));

            // 3. Anthropic Claude
            providers.put("anthropic", makeProvider(
                    "Anthropic Claude",
                    "Claude 4 Opus/Sonnet & Claude 3.7 Sonnet via your Anthropic API Key",
                    "https://api.anthropic.com/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("claude-sonnet-4-20250514", "Claude 4 Sonnet", true, true, 200000L, 64000L),
                            makeModel("claude-opus-4-20250514", "Claude 4 Opus", true, true, 200000L, 32000L),
                            makeModel("claude-3-7-sonnet-latest", "Claude 3.7 Sonnet", true, true, 200000L, 64000L),
                            makeModel("claude-3-5-haiku-latest", "Claude 3.5 Haiku", false, true, 200000L, 8192L)
                    }
            ));

            // 4. OpenRouter
            providers.put("openrouter", makeProvider(
                    "OpenRouter (All AI Models)",
                    "Access hundreds of AI models (Claude, Gemini, GPT, DeepSeek, Llama, Qwen) with a single API Key",
                    "https://openrouter.ai/api/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("anthropic/claude-sonnet-4", "Claude 4 Sonnet (OpenRouter)", true, true, 200000L, 64000L),
                            makeModel("anthropic/claude-3.7-sonnet", "Claude 3.7 Sonnet (OpenRouter)", true, true, 200000L, 64000L),
                            makeModel("google/gemini-2.5-pro-preview", "Gemini 2.5 Pro (OpenRouter)", true, true, 1048576L, 65536L),
                            makeModel("google/gemini-2.5-flash-preview", "Gemini 2.5 Flash (OpenRouter)", true, true, 1048576L, 65536L),
                            makeModel("openai/gpt-4.1", "GPT-4.1 (OpenRouter)", false, true, 1047576L, 32768L),
                            makeModel("deepseek/deepseek-r1", "DeepSeek R1 (OpenRouter)", true, true, 128000L, 32768L),
                            makeModel("deepseek/deepseek-chat-v3-0324", "DeepSeek V3 (OpenRouter)", false, true, 128000L, 16384L),
                            makeModel("qwen/qwq-32b", "Qwen QwQ 32B (OpenRouter)", true, true, 128000L, 16384L)
                    }
            ));

            // 5. DeepSeek
            providers.put("deepseek", makeProvider(
                    "DeepSeek",
                    "Official DeepSeek V3 (Chat) & DeepSeek R1 (Reasoner) API",
                    "https://api.deepseek.com/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("deepseek-chat", "DeepSeek V3 (Chat)", false, true, 64000L, 8192L),
                            makeModel("deepseek-reasoner", "DeepSeek R1 (Reasoner)", true, true, 64000L, 8192L)
                    }
            ));

            // 6. Groq Cloud
            providers.put("groq", makeProvider(
                    "Groq Cloud",
                    "Ultra-fast LPU inference for Llama 3.3, DeepSeek R1 Distill, and Qwen QwQ",
                    "https://api.groq.com/openai/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("llama-3.3-70b-versatile", "Llama 3.3 70B Versatile", false, true, 128000L, 32768L),
                            makeModel("deepseek-r1-distill-llama-70b", "DeepSeek R1 Distill Llama 70B", true, true, 128000L, 16384L),
                            makeModel("qwen-qwq-32b", "Qwen QwQ 32B", true, true, 128000L, 16384L),
                            makeModel("llama-3.1-8b-instant", "Llama 3.1 8B Instant", false, true, 128000L, 8192L)
                    }
            ));

            // 7. xAI Grok
            providers.put("xai", makeProvider(
                    "xAI (Grok)",
                    "Grok 3 & Grok 3 Mini using your xAI API Key",
                    "https://api.x.ai/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("grok-3-beta", "Grok 3", false, true, 131072L, 16384L),
                            makeModel("grok-3-mini-beta", "Grok 3 Mini (Reasoning)", true, true, 131072L, 16384L)
                    }
            ));

            // 8. Mistral AI
            providers.put("mistral", makeProvider(
                    "Mistral AI / Codestral",
                    "Codestral & Mistral Large using your Mistral API Key",
                    "https://api.mistral.ai/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("codestral-latest", "Codestral (Coding)", false, true, 256000L, 16384L),
                            makeModel("mistral-large-latest", "Mistral Large", false, true, 128000L, 16384L)
                    }
            ));

            // 9. Custom OpenAI / Gemini Compatible Endpoint
            providers.put("custom", makeProvider(
                    "Custom Endpoint / Local LLM",
                    "Any OpenAI/Gemini-compatible endpoint (Ollama, vLLM, LiteLLM, Together, Fireworks, etc.)",
                    "http://127.0.0.1:11434/v1",
                    "openai",
                    new JSONObject[]{
                            makeModel("qwen2.5-coder:7b", "Qwen 2.5 Coder 7B (Local)", false, true, 128000L, 8192L)
                    }
            ));

            root.put("providers", providers);
        } catch (Exception ignored) {
        }
        return root;
    }

    private static JSONObject makeProvider(String name, String description,
                                           String baseUrl, String wireProtocol,
                                           JSONObject[] defaultModels) throws Exception {
        JSONObject p = new JSONObject();
        p.put("name", name);
        p.put("description", description);
        p.put("apiKey", "");
        p.put("baseUrl", baseUrl);
        p.put("wireProtocol", wireProtocol);
        JSONArray arr = new JSONArray();
        for (JSONObject m : defaultModels) {
            arr.put(m);
        }
        p.put("models", arr);
        return p;
    }

    private static JSONObject makeModel(String modelId, String displayName,
                                        boolean supportsThinking, boolean enabled,
                                        long maxTokens, long maxOutputTokens) throws Exception {
        JSONObject m = new JSONObject();
        m.put("modelId", modelId);
        m.put("displayName", displayName);
        m.put("supportsThinking", supportsThinking);
        m.put("enabled", enabled);
        m.put("maxTokens", maxTokens);
        m.put("maxOutputTokens", maxOutputTokens);
        return m;
    }
}
