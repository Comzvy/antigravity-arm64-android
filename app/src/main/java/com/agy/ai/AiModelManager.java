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
            String wireProtocol = normalizeWireProtocol(
                    prov.optString("wireProtocol", "openai"), activeProvider);

            while (baseUrl.endsWith("/")) {
                baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            }

            if (!baseUrl.isEmpty()) {
                if ("genai".equals(wireProtocol)) {
                    String genaiBase = baseUrl.endsWith("/v1beta")
                            ? baseUrl.substring(0, baseUrl.length() - "/v1beta".length())
                            : baseUrl;
                    env.put("AGY_LLM_GATEWAY_URL", genaiBase);
                    env.put("AGY_LLM_GATEWAY_WIRE_PROTOCOL", "genai");
                } else {
                    int gwPort = resolveGatewayPort(appContext);
                    String localUrl = "http://127.0.0.1:" + gwPort + "/v1";
                    env.put("AGY_LLM_GATEWAY_URL", localUrl);
                    env.put("AGY_LLM_GATEWAY_WIRE_PROTOCOL", "openai");
                }
            }
            if ("gemini".equals(activeProvider) || "genai".equals(wireProtocol)) {
                if (!apiKey.isEmpty()) {
                    env.put("AGY_LLM_GATEWAY_API_KEY", apiKey);
                    env.put("GEMINI_API_KEY", apiKey);
                } else {
                    env.remove("AGY_LLM_GATEWAY_API_KEY");
                    env.remove("GEMINI_API_KEY");
                }
            } else {
                // Local SystemGatewayServer handles auth headers (or keyless local LLMs)
                env.put("AGY_LLM_GATEWAY_API_KEY", "agy-local-router");
                env.remove("GEMINI_API_KEY");
            }
            Log.i(TAG, "Configured AI Provider: " + activeProvider
                    + " (" + wireProtocol + ") -> " + baseUrl);
        } catch (Exception e) {
            Log.w(TAG, "Failed to apply AI environment: " + e.getMessage());
        }
    }

    private static String normalizeWireProtocol(String rawProtocol, String providerId) {
        String p = rawProtocol != null ? rawProtocol.trim().toLowerCase() : "";
        if ("genai".equals(p) || "gemini".equals(p)) {
            return "genai";
        }
        if ("anthropic".equals(p) || "messages".equals(p)) {
            return "anthropic";
        }
        if ("openai".equals(p)) {
            return "openai";
        }
        if ("gemini".equalsIgnoreCase(providerId)) {
            return "genai";
        }
        if ("anthropic".equalsIgnoreCase(providerId) || "custom_anthropic".equalsIgnoreCase(providerId)) {
            return "anthropic";
        }
        return "openai";
    }

    private static boolean isKeylessAllowedProvider(String pid) {
        return "custom".equals(pid) || "custom_anthropic".equals(pid);
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
                        "gemini", "openai", "anthropic", "custom_anthropic", "openrouter",
                        "deepseek", "groq", "xai", "mistral", "custom"
                };
                for (String pid : order) {
                    JSONObject p = providers.optJSONObject(pid);
                    if (p == null) continue;
                    String key = p.optString("apiKey", "").trim();
                    JSONObject cHeaders = p.optJSONObject("customHeaders");
                    boolean hasCustomHeaders = cHeaders != null && cHeaders.length() > 0;
                    if (key.isEmpty() && !hasCustomHeaders && !isKeylessAllowedProvider(pid)) continue;
                    if (isKeylessAllowedProvider(pid) && key.isEmpty()
                            && p.optString("baseUrl", "").trim().isEmpty()) {
                        continue;
                    }
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
                while (baseUrl.endsWith("/")) {
                    baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
                }
                String wireProtocol = normalizeWireProtocol(
                        prov.optString("wireProtocol", "openai"), activeProvider);

                gatewayObj.put("enabled", true);
                if ("genai".equals(wireProtocol)) {
                    String genaiBase = baseUrl.endsWith("/v1beta")
                            ? baseUrl.substring(0, baseUrl.length() - "/v1beta".length())
                            : baseUrl;
                    gatewayObj.put("url", genaiBase);
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
                    // Route OpenAI- and Anthropic-compatible traffic through local SystemGatewayServer so
                    // tool_call/tool_output pairing, request payloads, and Anthropic /v1/messages translation
                    // are handled transparently.
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
                try (java.io.FileInputStream fis = new java.io.FileInputStream(pFile)) {
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
     * Resolves the /models discovery endpoint URL for any baseUrl and wireProtocol.
     */
    public static String resolveModelsEndpointUrl(String rawBaseUrl, String wireProtocol, String providerId) {
        String cleanUrl = rawBaseUrl != null ? rawBaseUrl.trim() : "";
        while (cleanUrl.endsWith("/")) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.length() - 1);
        }
        if (cleanUrl.endsWith("/chat/completions")) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.length() - "/chat/completions".length());
        } else if (cleanUrl.endsWith("/messages")) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.length() - "/messages".length());
        }
        while (cleanUrl.endsWith("/")) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.length() - 1);
        }
        if (cleanUrl.endsWith("/models")) {
            return cleanUrl;
        }
        String proto = normalizeWireProtocol(wireProtocol, providerId);
        if ("genai".equals(proto) && !cleanUrl.endsWith("/openai")) {
            if (cleanUrl.endsWith("/v1beta")) {
                return cleanUrl + "/models?pageSize=100";
            }
            return cleanUrl + "/v1beta/models?pageSize=100";
        }
        if (cleanUrl.endsWith("/v1") || cleanUrl.endsWith("/openai")
                || cleanUrl.endsWith("/v1beta") || cleanUrl.endsWith("/anthropic")) {
            return cleanUrl + "/models";
        }
        return cleanUrl + "/v1/models";
    }

    /**
     * Resolves the OpenAI /v1/chat/completions endpoint URL for a given baseUrl.
     */
    public static String resolveOpenAiChatUrl(String rawBaseUrl, String providerId, String wireProtocol) {
        String baseUrl = rawBaseUrl != null ? rawBaseUrl.trim() : "";
        while (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        if (baseUrl.endsWith("/chat/completions")) {
            return baseUrl;
        }
        if (baseUrl.endsWith("/messages")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - "/messages".length());
        }
        if (("gemini".equals(providerId) || "genai".equals(wireProtocol)) && !baseUrl.contains("/openai")) {
            if (baseUrl.endsWith("/v1beta")) {
                return baseUrl + "/openai/chat/completions";
            }
            return baseUrl + "/v1beta/openai/chat/completions";
        }
        if (baseUrl.endsWith("/v1") || baseUrl.endsWith("/openai") || baseUrl.endsWith("/v1beta")) {
            return baseUrl + "/chat/completions";
        }
        return baseUrl + "/v1/chat/completions";
    }

    /**
     * Resolves the Anthropic /v1/messages endpoint URL for a given baseUrl.
     */
    public static String resolveAnthropicMessagesUrl(String rawBaseUrl) {
        String baseUrl = rawBaseUrl != null ? rawBaseUrl.trim() : "";
        while (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        if (baseUrl.endsWith("/messages")) {
            return baseUrl;
        }
        if (baseUrl.endsWith("/chat/completions")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - "/chat/completions".length());
        }
        if (baseUrl.endsWith("/v1") || baseUrl.endsWith("/v1beta") || baseUrl.endsWith("/anthropic")) {
            return baseUrl + "/messages";
        }
        return baseUrl + "/v1/messages";
    }

    /**
     * Tests an API Key and fetches available models from the provider's endpoint.
     * Supports fallback live message probes for custom Anthropic/OpenAI endpoints that do not expose GET /v1/models.
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

            String proto = normalizeWireProtocol(wireProtocol, providerId);
            boolean isGenAi = "genai".equals(proto) && !cleanUrl.endsWith("/openai");
            boolean isAnthropic = "anthropic".equals(proto)
                    || "anthropic".equalsIgnoreCase(providerId)
                    || "custom_anthropic".equalsIgnoreCase(providerId);
            String targetUrl = resolveModelsEndpointUrl(cleanUrl, proto, providerId);

            conn = (HttpURLConnection) new URL(targetUrl).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "Antigravity-Android/2.0");

            String key = apiKey != null ? apiKey.trim() : "";
            if (isGenAi) {
                if (!key.isEmpty()) {
                    conn.setRequestProperty("x-goog-api-key", key);
                }
            } else if (isAnthropic) {
                conn.setRequestProperty("anthropic-version", "2023-06-01");
                if (!key.isEmpty()) {
                    conn.setRequestProperty("x-api-key", key);
                    conn.setRequestProperty("Authorization", "Bearer " + key);
                }
            } else if (!key.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + key);
            }

            int status = conn.getResponseCode();
            InputStream in = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            String body = readStreamToString(in);

            if (status < 200 || status >= 300) {
                // Many custom Anthropic/OpenAI proxies only expose POST /v1/messages or /v1/chat/completions
                // and return 404/405/400/501 on GET /v1/models. Try a live endpoint probe in that case.
                if (status != 401 && status != 403) {
                    if (isAnthropic) {
                        JSONObject probe = probeAnthropicEndpoint(cleanUrl, key);
                        if (probe.optBoolean("ok", false)) {
                            return probe.toString();
                        }
                    } else if (!isGenAi && ("custom".equalsIgnoreCase(providerId) || status == 404 || status == 405)) {
                        JSONObject probe = probeOpenAiEndpoint(cleanUrl, key, providerId, proto);
                        if (probe.optBoolean("ok", false)) {
                            return probe.toString();
                        }
                    }
                }
                result.put("ok", false);
                result.put("status", status);
                result.put("error", "HTTP " + status + ": " + formatHttpErrorPreview(body));
                return result.toString();
            }

            JSONArray discovered = new JSONArray();
            String trimmedBody = body != null ? body.trim() : "";
            if (trimmedBody.startsWith("[")) {
                JSONArray rawArr = new JSONArray(trimmedBody);
                parseOpenAiOrAnthropicModelArray(rawArr, discovered, isAnthropic);
            } else {
                JSONObject json = new JSONObject(trimmedBody.isEmpty() ? "{}" : trimmedBody);
                if (json.has("models") && json.optJSONArray("models") != null) {
                    // Gemini /v1beta/models format
                    JSONArray arr = json.optJSONArray("models");
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject item = arr.optJSONObject(i);
                        if (item == null) continue;
                        String name = item.optString("name", item.optString("id", ""));
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
                        String disp = item.optString("displayName", item.optString("display_name", name));
                        boolean thinking = item.optBoolean("thinking", false)
                                || isReasoningModelId(name);
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
                    // OpenAI & Anthropic /v1/models format
                    parseOpenAiOrAnthropicModelArray(json.optJSONArray("data"), discovered, isAnthropic);
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

    private static void parseOpenAiOrAnthropicModelArray(JSONArray arr, JSONArray discovered,
                                                         boolean isAnthropic) throws Exception {
        if (arr == null) return;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id", item.optString("modelId", "")).trim();
            if (id.isEmpty() || isNonChatModel(id)) continue;
            String disp = item.optString("display_name",
                    item.optString("name", item.optString("displayName", id))).trim();
            if (disp.isEmpty()) disp = id;
            boolean thinking = isReasoningModelId(id);
            long defaultCtx = (isAnthropic || id.contains("claude")) ? 200000L : 128000L;
            long defaultOut = 16384L;
            if (id.contains("claude-sonnet-4") || id.contains("claude-3-7") || id.contains("claude-haiku-4")) {
                defaultOut = 64000L;
            } else if (id.contains("claude-opus-4")) {
                defaultOut = 32000L;
            } else if (id.contains("claude-3-5")) {
                defaultOut = 8192L;
            }
            long maxTokens = item.optLong("context_length",
                    item.optLong("max_input_tokens", item.optLong("maxTokens", defaultCtx)));
            long maxOut = item.optLong("max_output_tokens",
                    item.optLong("max_completion_tokens", item.optLong("maxOutputTokens", defaultOut)));
            JSONObject mObj = new JSONObject();
            mObj.put("modelId", id);
            mObj.put("displayName", disp);
            mObj.put("supportsThinking", thinking);
            mObj.put("enabled", i < 15); // enable first 15 by default so catalog isn't flooded
            mObj.put("maxTokens", maxTokens > 0 ? maxTokens : defaultCtx);
            mObj.put("maxOutputTokens", maxOut > 0 ? maxOut : defaultOut);
            discovered.put(mObj);
        }
    }

    private static boolean isReasoningModelId(String id) {
        if (id == null) return false;
        String lower = id.toLowerCase();
        return lower.contains("o1") || lower.contains("o3") || lower.contains("o4")
                || lower.contains("reasoner") || lower.contains("-r1") || lower.contains("/r1")
                || lower.contains("qwq") || lower.contains("thinking")
                || lower.contains("claude-3-7") || lower.contains("claude-sonnet-4")
                || lower.contains("claude-opus-4") || lower.contains("claude-4")
                || lower.contains("gemini-2.5") || lower.contains("gemini-3")
                || lower.contains("grok-3-mini");
    }

    /**
     * Fallback live probe for custom Anthropic endpoints that only implement POST /v1/messages
     * and do not expose GET /v1/models.
     */
    private static JSONObject probeAnthropicEndpoint(String baseUrl, String apiKey) {
        JSONObject res = new JSONObject();
        HttpURLConnection conn = null;
        try {
            String messagesUrl = resolveAnthropicMessagesUrl(baseUrl);
            JSONObject payload = new JSONObject();
            payload.put("model", "claude-sonnet-4-20250514");
            payload.put("max_tokens", 1);
            JSONArray msgs = new JSONArray();
            JSONObject u = new JSONObject();
            u.put("role", "user");
            u.put("content", "ping");
            msgs.put(u);
            payload.put("messages", msgs);

            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(messagesUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "Antigravity-Android/2.0");
            conn.setRequestProperty("anthropic-version", "2023-06-01");
            if (apiKey != null && !apiKey.isEmpty()) {
                conn.setRequestProperty("x-api-key", apiKey);
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            }
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
                os.flush();
            }

            int status = conn.getResponseCode();
            InputStream in = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            String body = readStreamToString(in);

            // HTTP 200 means full success; HTTP 400 with "model" / "not_found_error" on custom proxy
            // (where the proxy maps its own model IDs) also proves the endpoint & auth succeeded!
            boolean authOk = (status >= 200 && status < 300)
                    || (status == 400 && (body.contains("model") || body.contains("invalid_request_error") || body.contains("not_found")));
            if (authOk) {
                res.put("ok", true);
                res.put("verifiedViaProbe", true);
                res.put("models", buildDefaultAnthropicModelsArray());
                return res;
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return res;
    }

    /**
     * Fallback live probe for custom OpenAI-compatible endpoints that do not implement GET /v1/models.
     */
    private static JSONObject probeOpenAiEndpoint(String baseUrl, String apiKey,
                                                  String providerId, String wireProtocol) {
        JSONObject res = new JSONObject();
        HttpURLConnection conn = null;
        try {
            String chatUrl = resolveOpenAiChatUrl(baseUrl, providerId, wireProtocol);
            JSONObject payload = new JSONObject();
            payload.put("model", "gpt-4o-mini");
            payload.put("max_tokens", 1);
            JSONArray msgs = new JSONArray();
            JSONObject u = new JSONObject();
            u.put("role", "user");
            u.put("content", "ping");
            msgs.put(u);
            payload.put("messages", msgs);

            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(chatUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "Antigravity-Android/2.0");
            if (apiKey != null && !apiKey.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            }
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
                os.flush();
            }

            int status = conn.getResponseCode();
            InputStream in = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            String body = readStreamToString(in);

            boolean authOk = (status >= 200 && status < 300)
                    || (status == 400 && (body.contains("model") || body.contains("error")))
                    || (status == 404 && body.contains("model"));
            if (authOk) {
                res.put("ok", true);
                res.put("verifiedViaProbe", true);
                res.put("models", new JSONArray());
                return res;
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return res;
    }

    private static String formatHttpErrorPreview(String body) {
        if (body == null || body.trim().isEmpty()) {
            return "(empty error response)";
        }
        try {
            JSONObject errJson = new JSONObject(body);
            JSONObject errObj = errJson.optJSONObject("error");
            if (errObj != null) {
                String msg = errObj.optString("message", "");
                String type = errObj.optString("type", "");
                if (!msg.isEmpty()) {
                    return !type.isEmpty() ? (type + ": " + msg) : msg;
                }
            }
            String topMsg = errJson.optString("message", errJson.optString("detail", ""));
            if (!topMsg.isEmpty()) {
                return topMsg;
            }
        } catch (Exception ignored) {
        }
        String clean = body.trim().replaceAll("\\s+", " ");
        return clean.length() > 240 ? clean.substring(0, 240) + "..." : clean;
    }

    /**
     * Multi-Provider & Multi-Protocol local router for /v1/chat/completions in SystemGatewayServer.
     * Routes requests based on the "provider::modelId" prefix, activeProvider, or matching provider catalog,
     * and transparently translates OpenAI chat/completions <-> Anthropic /v1/messages when wireProtocol="anthropic".
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

            String activeProvider = cfg.optString("activeProvider", "gemini");
            String targetProviderId = null;
            String actualModelId = requestedModel;

            if (requestedModel.contains("::")) {
                int idx = requestedModel.indexOf("::");
                targetProviderId = requestedModel.substring(0, idx);
                actualModelId = requestedModel.substring(idx + 2);
                reqJson.put("model", actualModelId);
            } else if (!"multi".equals(activeProvider) && providers.optJSONObject(activeProvider) != null) {
                // Single-provider mode: always route through the user's selected activeProvider first
                targetProviderId = activeProvider;
            } else {
                // Multi-provider fallback: find which configured provider owns this modelId
                String[] priorityOrder = new String[]{
                        "gemini", "openai", "anthropic", "custom_anthropic",
                        "openrouter", "deepseek", "groq", "xai", "mistral", "custom"
                };
                for (String pid : priorityOrder) {
                    JSONObject p = providers.optJSONObject(pid);
                    if (p == null) continue;
                    if (p.optString("apiKey", "").trim().isEmpty() && !isKeylessAllowedProvider(pid)) continue;
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
                targetProviderId = !"multi".equals(activeProvider) ? activeProvider : "openai";
            }

            JSONObject prov = providers.optJSONObject(targetProviderId);
            if (prov == null) {
                writeHttpJsonError(clientOut, 400, "Unknown AI provider: " + targetProviderId);
                return;
            }

            String wireProtocol = normalizeWireProtocol(
                    prov.optString("wireProtocol", "openai"), targetProviderId);

            // If provider uses native Anthropic Messages API (/v1/messages), translate request & response
            if ("anthropic".equals(wireProtocol)) {
                proxyAnthropicMessages(prov, targetProviderId, actualModelId, reqJson, clientOut);
                return;
            }

            String apiKey = prov.optString("apiKey", "").trim();
            String baseUrl = prov.optString("baseUrl", "").trim();
            String targetEndpoint = resolveOpenAiChatUrl(baseUrl, targetProviderId, wireProtocol);

            sanitizeOpenAiMessages(reqJson);

            byte[] outBytes = reqJson.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(targetEndpoint).openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(180000);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("User-Agent", "Antigravity-Android/2.0");
            conn.setRequestProperty("Accept", reqJson.optBoolean("stream", false)
                    ? "text/event-stream" : "application/json");

            if (!apiKey.isEmpty()) {
                if ("anthropic".equals(targetProviderId) || "custom_anthropic".equals(targetProviderId)) {
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

            applyCustomHeaders(conn, prov.optJSONObject("customHeaders"));

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
     * Direct passthrough proxy for native POST /v1/messages requests arriving at SystemGatewayServer.
     */
    public static void proxyNativeAnthropicMessages(Context context, String requestBody, OutputStream clientOut) {
        HttpURLConnection conn = null;
        try {
            JSONObject reqJson = new JSONObject(requestBody);
            JSONObject cfg = getConfig(context);
            JSONObject providers = cfg.optJSONObject("providers");
            if (providers == null) {
                writeHttpJsonError(clientOut, 500, "No AI providers configured");
                return;
            }
            String activeProvider = cfg.optString("activeProvider", "anthropic");
            JSONObject prov = providers.optJSONObject(activeProvider);
            if (prov == null) {
                prov = providers.optJSONObject("custom_anthropic");
            }
            if (prov == null) {
                prov = providers.optJSONObject("anthropic");
            }
            if (prov == null) {
                writeHttpJsonError(clientOut, 400, "No Anthropic provider configured");
                return;
            }
            String apiKey = prov.optString("apiKey", "").trim();
            String targetEndpoint = resolveAnthropicMessagesUrl(prov.optString("baseUrl", "https://api.anthropic.com/v1"));
            byte[] outBytes = reqJson.toString().getBytes(StandardCharsets.UTF_8);

            conn = (HttpURLConnection) new URL(targetEndpoint).openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(180000);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("User-Agent", "Antigravity-Android/2.0");
            conn.setRequestProperty("anthropic-version", "2023-06-01");
            conn.setRequestProperty("Accept", reqJson.optBoolean("stream", false)
                    ? "text/event-stream" : "application/json");
            if (!apiKey.isEmpty()) {
                conn.setRequestProperty("x-api-key", apiKey);
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            }
            applyCustomHeaders(conn, prov.optJSONObject("customHeaders"));

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
            try {
                writeHttpJsonError(clientOut, 502, "Anthropic proxy error: " + e.getMessage());
            } catch (Exception ignored) {
            }
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * Translates an OpenAI /v1/chat/completions request into a native Anthropic /v1/messages
     * request, sends it to the configured Anthropic endpoint (official or custom), and translates
     * both SSE streaming and non-streaming responses back into OpenAI format.
     */
    private static void proxyAnthropicMessages(JSONObject prov, String providerId,
                                               String actualModelId, JSONObject openAiReq,
                                               OutputStream clientOut) {
        HttpURLConnection conn = null;
        try {
            sanitizeOpenAiMessages(openAiReq);
            boolean isStream = openAiReq.optBoolean("stream", false);
            JSONObject anthropicReq = convertOpenAiToAnthropicRequest(openAiReq, actualModelId, prov);

            String apiKey = prov.optString("apiKey", "").trim();
            String baseUrl = prov.optString("baseUrl", "https://api.anthropic.com/v1").trim();
            String targetEndpoint = resolveAnthropicMessagesUrl(baseUrl);

            byte[] outBytes = anthropicReq.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(targetEndpoint).openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(180000);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("User-Agent", "Antigravity-Android/2.0");
            conn.setRequestProperty("anthropic-version", "2023-06-01");
            conn.setRequestProperty("Accept", isStream ? "text/event-stream" : "application/json");

            if (!apiKey.isEmpty()) {
                conn.setRequestProperty("x-api-key", apiKey);
                if (!targetEndpoint.contains("api.anthropic.com")) {
                    // Third-party Anthropic-compatible gateways (LiteLLM, Zhipu, MiniMax, etc.)
                    // may authenticate via either x-api-key or Authorization: Bearer
                    conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                }
            }

            applyCustomHeaders(conn, prov.optJSONObject("customHeaders"));

            try (OutputStream os = conn.getOutputStream()) {
                os.write(outBytes);
                os.flush();
            }

            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                String errBody = readStreamToString(conn.getErrorStream());
                writeHttpJsonError(clientOut, status,
                        "Anthropic endpoint error (" + status + "): " + formatHttpErrorPreview(errBody));
                return;
            }

            String contentType = conn.getContentType();
            boolean upstreamIsSse = contentType != null && contentType.toLowerCase().contains("text/event-stream");

            if (isStream && upstreamIsSse) {
                streamAnthropicSseToOpenAi(conn.getInputStream(), actualModelId, clientOut);
            } else if (isStream) {
                // Custom endpoint returned non-SSE JSON even though stream=true was requested
                String jsonBody = readStreamToString(conn.getInputStream());
                writeAnthropicJsonAsOpenAiSse(jsonBody, actualModelId, clientOut);
            } else {
                String jsonBody = readStreamToString(conn.getInputStream());
                JSONObject openAiResp = convertAnthropicToOpenAiResponse(new JSONObject(jsonBody), actualModelId);
                byte[] respBytes = openAiResp.toString().getBytes(StandardCharsets.UTF_8);
                String header = "HTTP/1.1 200 OK\r\n"
                        + "Content-Type: application/json; charset=utf-8\r\n"
                        + "Content-Length: " + respBytes.length + "\r\n"
                        + "Cache-Control: no-cache\r\n"
                        + "Connection: close\r\n\r\n";
                clientOut.write(header.getBytes(StandardCharsets.UTF_8));
                clientOut.write(respBytes);
                clientOut.flush();
            }
        } catch (Exception e) {
            Log.w(TAG, "proxyAnthropicMessages error (" + providerId + "): " + e.getMessage());
            try {
                writeHttpJsonError(clientOut, 502, "Anthropic gateway error: " + e.getMessage());
            } catch (Exception ignored) {
            }
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static void applyCustomHeaders(HttpURLConnection conn, JSONObject extraHeaders) {
        if (conn == null || extraHeaders == null) return;
        Iterator<String> hKeys = extraHeaders.keys();
        while (hKeys.hasNext()) {
            String k = hKeys.next();
            String v = extraHeaders.optString(k, "").trim();
            if (!k.trim().isEmpty() && !v.isEmpty()) {
                conn.setRequestProperty(k.trim(), v);
            }
        }
    }

    private static String sanitizeAnthropicToolId(String rawId) {
        if (rawId == null || rawId.trim().isEmpty()) {
            return "toolu_" + System.currentTimeMillis();
        }
        String cleaned = rawId.trim().replaceAll("[^a-zA-Z0-9_-]", "_");
        return cleaned.isEmpty() ? "toolu_0" : cleaned;
    }

    /**
     * Converts an OpenAI Chat Completions payload into an Anthropic /v1/messages payload.
     */
    public static JSONObject convertOpenAiToAnthropicRequest(JSONObject openAiReq,
                                                             String actualModelId,
                                                             JSONObject prov) throws Exception {
        JSONObject out = new JSONObject();
        String model = (actualModelId != null && !actualModelId.isEmpty())
                ? actualModelId
                : openAiReq.optString("model", "claude-sonnet-4-20250514");
        out.put("model", model);
        out.put("stream", openAiReq.optBoolean("stream", false));

        // Resolve max_tokens (mandatory in Anthropic /v1/messages)
        int maxTokens = openAiReq.optInt("max_completion_tokens",
                openAiReq.optInt("max_tokens", 0));
        if (maxTokens <= 0 && prov != null) {
            JSONArray mArr = prov.optJSONArray("models");
            if (mArr != null) {
                for (int i = 0; i < mArr.length(); i++) {
                    JSONObject m = mArr.optJSONObject(i);
                    if (m != null && model.equals(m.optString("modelId"))) {
                        maxTokens = (int) m.optLong("maxOutputTokens", 16384L);
                        break;
                    }
                }
            }
        }
        if (maxTokens <= 0) {
            maxTokens = 16384;
        }
        out.put("max_tokens", maxTokens);

        // Extract system prompt and convert conversation messages
        StringBuilder systemBuilder = new StringBuilder();
        JSONArray rawMessages = openAiReq.optJSONArray("messages");
        JSONArray anthropicMessages = new JSONArray();

        if (rawMessages != null) {
            for (int i = 0; i < rawMessages.length(); i++) {
                JSONObject msg = rawMessages.optJSONObject(i);
                if (msg == null) continue;
                String role = msg.optString("role", "user");

                if ("system".equals(role) || "developer".equals(role)) {
                    String sysText = extractOpenAiTextContent(msg.opt("content"));
                    if (!sysText.isEmpty()) {
                        if (systemBuilder.length() > 0) {
                            systemBuilder.append("\n\n");
                        }
                        systemBuilder.append(sysText);
                    }
                    continue;
                }

                if ("tool".equals(role)) {
                    String toolCallId = sanitizeAnthropicToolId(msg.optString("tool_call_id", "call_0"));
                    String toolContent = extractOpenAiTextContent(msg.opt("content"));
                    if (toolContent.isEmpty()) {
                        toolContent = "(no output)";
                    }
                    JSONObject toolResultBlock = new JSONObject();
                    toolResultBlock.put("type", "tool_result");
                    toolResultBlock.put("tool_use_id", toolCallId);
                    toolResultBlock.put("content", toolContent);

                    JSONArray blocks = new JSONArray();
                    blocks.put(toolResultBlock);
                    appendOrMergeAnthropicMessage(anthropicMessages, "user", blocks);
                    continue;
                }

                if ("assistant".equals(role)) {
                    JSONArray blocks = new JSONArray();
                    String text = extractOpenAiTextContent(msg.opt("content"));
                    if (!text.isEmpty()) {
                        JSONObject tb = new JSONObject();
                        tb.put("type", "text");
                        tb.put("text", text);
                        blocks.put(tb);
                    }
                    JSONArray toolCalls = msg.optJSONArray("tool_calls");
                    if (toolCalls != null) {
                        for (int t = 0; t < toolCalls.length(); t++) {
                            JSONObject tc = toolCalls.optJSONObject(t);
                            if (tc == null) continue;
                            JSONObject fn = tc.optJSONObject("function");
                            if (fn == null) continue;
                            String fnName = fn.optString("name", "").trim();
                            if (fnName.isEmpty()) continue;
                            String tcId = sanitizeAnthropicToolId(tc.optString("id", "toolu_" + i + "_" + t));
                            String rawArgs = fn.optString("arguments", "{}");
                            JSONObject inputObj;
                            try {
                                inputObj = new JSONObject(rawArgs);
                            } catch (Exception e) {
                                inputObj = new JSONObject();
                            }
                            JSONObject toolUseBlock = new JSONObject();
                            toolUseBlock.put("type", "tool_use");
                            toolUseBlock.put("id", tcId);
                            toolUseBlock.put("name", fnName);
                            toolUseBlock.put("input", inputObj);
                            blocks.put(toolUseBlock);
                        }
                    }
                    if (blocks.length() > 0) {
                        appendOrMergeAnthropicMessage(anthropicMessages, "assistant", blocks);
                    }
                    continue;
                }

                // Default: user message (supports text + base64/URL images)
                JSONArray userBlocks = convertOpenAiUserContentToAnthropicBlocks(msg.opt("content"));
                if (userBlocks.length() > 0) {
                    appendOrMergeAnthropicMessage(anthropicMessages, "user", userBlocks);
                }
            }
        }

        // Anthropic requires at least one message and the first message must have role="user"
        if (anthropicMessages.length() == 0) {
            JSONObject fallbackUser = new JSONObject();
            fallbackUser.put("role", "user");
            JSONArray blocks = new JSONArray();
            JSONObject tb = new JSONObject();
            tb.put("type", "text");
            tb.put("text", "Hello");
            blocks.put(tb);
            fallbackUser.put("content", blocks);
            anthropicMessages.put(fallbackUser);
        } else if (!"user".equals(anthropicMessages.optJSONObject(0).optString("role"))) {
            JSONArray shifted = new JSONArray();
            JSONObject firstUser = new JSONObject();
            firstUser.put("role", "user");
            JSONArray blocks = new JSONArray();
            JSONObject tb = new JSONObject();
            tb.put("type", "text");
            tb.put("text", "Continue.");
            blocks.put(tb);
            firstUser.put("content", blocks);
            shifted.put(firstUser);
            for (int i = 0; i < anthropicMessages.length(); i++) {
                shifted.put(anthropicMessages.get(i));
            }
            anthropicMessages = shifted;
        }

        if (systemBuilder.length() > 0) {
            out.put("system", systemBuilder.toString());
        }
        out.put("messages", anthropicMessages);

        // Convert OpenAI tools -> Anthropic tools
        JSONArray openAiTools = openAiReq.optJSONArray("tools");
        if (openAiTools != null && openAiTools.length() > 0) {
            JSONArray anthropicTools = new JSONArray();
            for (int i = 0; i < openAiTools.length(); i++) {
                JSONObject t = openAiTools.optJSONObject(i);
                if (t == null) continue;
                JSONObject fn = t.optJSONObject("function");
                if (fn == null) continue;
                String name = fn.optString("name", "").trim();
                if (name.isEmpty()) continue;

                JSONObject at = new JSONObject();
                at.put("name", name);
                String desc = fn.optString("description", "");
                if (!desc.isEmpty()) {
                    at.put("description", desc);
                }
                JSONObject params = fn.optJSONObject("parameters");
                if (params != null) {
                    JSONObject schema = new JSONObject(params.toString());
                    if (!schema.has("type")) {
                        schema.put("type", "object");
                    }
                    at.put("input_schema", schema);
                } else {
                    JSONObject emptySchema = new JSONObject();
                    emptySchema.put("type", "object");
                    emptySchema.put("properties", new JSONObject());
                    at.put("input_schema", emptySchema);
                }
                anthropicTools.put(at);
            }
            if (anthropicTools.length() > 0) {
                out.put("tools", anthropicTools);

                Object tcObj = openAiReq.opt("tool_choice");
                if (tcObj instanceof String) {
                    String tcStr = (String) tcObj;
                    if ("auto".equalsIgnoreCase(tcStr)) {
                        JSONObject tc = new JSONObject();
                        tc.put("type", "auto");
                        out.put("tool_choice", tc);
                    } else if ("required".equalsIgnoreCase(tcStr)) {
                        JSONObject tc = new JSONObject();
                        tc.put("type", "any");
                        out.put("tool_choice", tc);
                    } else if ("none".equalsIgnoreCase(tcStr)) {
                        out.remove("tools");
                    }
                } else if (tcObj instanceof JSONObject) {
                    JSONObject tcJson = (JSONObject) tcObj;
                    JSONObject fn = tcJson.optJSONObject("function");
                    if (fn != null && !fn.optString("name", "").isEmpty()) {
                        JSONObject tc = new JSONObject();
                        tc.put("type", "tool");
                        tc.put("name", fn.optString("name"));
                        out.put("tool_choice", tc);
                    }
                }
            }
        }

        if (openAiReq.has("temperature") && !openAiReq.isNull("temperature")) {
            out.put("temperature", openAiReq.optDouble("temperature", 1.0));
        }
        if (openAiReq.has("top_p") && !openAiReq.isNull("top_p")) {
            out.put("top_p", openAiReq.optDouble("top_p", 1.0));
        }

        return out;
    }

    private static void appendOrMergeAnthropicMessage(JSONArray messages, String role, JSONArray newBlocks) throws Exception {
        if (newBlocks == null || newBlocks.length() == 0) return;
        if (messages.length() > 0) {
            JSONObject last = messages.optJSONObject(messages.length() - 1);
            if (last != null && role.equals(last.optString("role"))) {
                JSONArray existing = last.optJSONArray("content");
                if (existing == null) {
                    existing = new JSONArray();
                }
                // Anthropic requires tool_result blocks in a user message to precede text blocks
                if ("user".equals(role)) {
                    JSONArray toolResults = new JSONArray();
                    JSONArray others = new JSONArray();
                    for (int i = 0; i < existing.length(); i++) {
                        JSONObject b = existing.optJSONObject(i);
                        if (b != null && "tool_result".equals(b.optString("type"))) {
                            toolResults.put(b);
                        } else if (b != null) {
                            others.put(b);
                        }
                    }
                    for (int i = 0; i < newBlocks.length(); i++) {
                        JSONObject b = newBlocks.optJSONObject(i);
                        if (b != null && "tool_result".equals(b.optString("type"))) {
                            toolResults.put(b);
                        } else if (b != null) {
                            others.put(b);
                        }
                    }
                    JSONArray combined = new JSONArray();
                    for (int i = 0; i < toolResults.length(); i++) combined.put(toolResults.get(i));
                    for (int i = 0; i < others.length(); i++) combined.put(others.get(i));
                    last.put("content", combined);
                } else {
                    for (int i = 0; i < newBlocks.length(); i++) {
                        existing.put(newBlocks.get(i));
                    }
                    last.put("content", existing);
                }
                return;
            }
        }
        JSONObject msg = new JSONObject();
        msg.put("role", role);
        msg.put("content", newBlocks);
        messages.put(msg);
    }

    private static String extractOpenAiTextContent(Object contentObj) {
        if (contentObj == null || contentObj == JSONObject.NULL) {
            return "";
        }
        if (contentObj instanceof String) {
            return (String) contentObj;
        }
        if (contentObj instanceof JSONArray) {
            JSONArray arr = (JSONArray) contentObj;
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < arr.length(); i++) {
                Object elem = arr.opt(i);
                if (elem instanceof String) {
                    sb.append((String) elem);
                } else if (elem instanceof JSONObject) {
                    JSONObject part = (JSONObject) elem;
                    String type = part.optString("type", "text");
                    if ("text".equals(type) || part.has("text")) {
                        sb.append(part.optString("text", ""));
                    }
                }
            }
            return sb.toString();
        }
        return String.valueOf(contentObj);
    }

    private static JSONArray convertOpenAiUserContentToAnthropicBlocks(Object contentObj) throws Exception {
        JSONArray blocks = new JSONArray();
        if (contentObj == null || contentObj == JSONObject.NULL) {
            JSONObject tb = new JSONObject();
            tb.put("type", "text");
            tb.put("text", " ");
            blocks.put(tb);
            return blocks;
        }
        if (contentObj instanceof String) {
            String text = (String) contentObj;
            JSONObject tb = new JSONObject();
            tb.put("type", "text");
            tb.put("text", text.isEmpty() ? " " : text);
            blocks.put(tb);
            return blocks;
        }
        if (contentObj instanceof JSONArray) {
            JSONArray arr = (JSONArray) contentObj;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject part = arr.optJSONObject(i);
                if (part == null) continue;
                String type = part.optString("type", "text");
                if ("text".equals(type)) {
                    String text = part.optString("text", "");
                    if (!text.isEmpty()) {
                        JSONObject tb = new JSONObject();
                        tb.put("type", "text");
                        tb.put("text", text);
                        blocks.put(tb);
                    }
                } else if ("image_url".equals(type)) {
                    JSONObject imgUrlObj = part.optJSONObject("image_url");
                    String url = imgUrlObj != null
                            ? imgUrlObj.optString("url", "")
                            : part.optString("image_url", "");
                    if (url.startsWith("data:")) {
                        int commaIdx = url.indexOf(',');
                        if (commaIdx > 5) {
                            String meta = url.substring(5, commaIdx);
                            String data = url.substring(commaIdx + 1);
                            String mediaType = meta.split(";")[0].trim();
                            if (mediaType.isEmpty()) mediaType = "image/png";
                            JSONObject imgBlock = new JSONObject();
                            imgBlock.put("type", "image");
                            JSONObject src = new JSONObject();
                            src.put("type", "base64");
                            src.put("media_type", mediaType);
                            src.put("data", data);
                            imgBlock.put("source", src);
                            blocks.put(imgBlock);
                        }
                    } else if (url.startsWith("http://") || url.startsWith("https://")) {
                        JSONObject imgBlock = new JSONObject();
                        imgBlock.put("type", "image");
                        JSONObject src = new JSONObject();
                        src.put("type", "url");
                        src.put("url", url);
                        imgBlock.put("source", src);
                        blocks.put(imgBlock);
                    }
                }
            }
        }
        if (blocks.length() == 0) {
            JSONObject tb = new JSONObject();
            tb.put("type", "text");
            tb.put("text", " ");
            blocks.put(tb);
        }
        return blocks;
    }

    /**
     * Converts a non-streaming Anthropic /v1/messages JSON response into an OpenAI chat.completion JSON response.
     */
    public static JSONObject convertAnthropicToOpenAiResponse(JSONObject anthResp, String fallbackModel) throws Exception {
        JSONObject out = new JSONObject();
        out.put("id", anthResp.optString("id", "chatcmpl-" + System.currentTimeMillis()));
        out.put("object", "chat.completion");
        out.put("created", System.currentTimeMillis() / 1000L);
        out.put("model", anthResp.optString("model", fallbackModel));

        StringBuilder textContent = new StringBuilder();
        StringBuilder reasoningContent = new StringBuilder();
        JSONArray toolCalls = new JSONArray();

        JSONArray contentArr = anthResp.optJSONArray("content");
        if (contentArr != null) {
            for (int i = 0; i < contentArr.length(); i++) {
                JSONObject block = contentArr.optJSONObject(i);
                if (block == null) continue;
                String bType = block.optString("type", "");
                if ("text".equals(bType)) {
                    textContent.append(block.optString("text", ""));
                } else if ("thinking".equals(bType)) {
                    reasoningContent.append(block.optString("thinking", ""));
                } else if ("tool_use".equals(bType)) {
                    JSONObject tc = new JSONObject();
                    tc.put("id", block.optString("id", "call_" + i));
                    tc.put("type", "function");
                    JSONObject fn = new JSONObject();
                    fn.put("name", block.optString("name", ""));
                    JSONObject input = block.optJSONObject("input");
                    fn.put("arguments", input != null ? input.toString() : "{}");
                    tc.put("function", fn);
                    toolCalls.put(tc);
                }
            }
        }

        JSONObject message = new JSONObject();
        message.put("role", "assistant");
        if (textContent.length() > 0 || toolCalls.length() == 0) {
            message.put("content", textContent.toString());
        } else {
            message.put("content", JSONObject.NULL);
        }
        if (reasoningContent.length() > 0) {
            message.put("reasoning_content", reasoningContent.toString());
        }
        if (toolCalls.length() > 0) {
            message.put("tool_calls", toolCalls);
        }

        String stopReason = anthResp.optString("stop_reason", "end_turn");
        String finishReason = "stop";
        if ("tool_use".equals(stopReason) || toolCalls.length() > 0) {
            finishReason = "tool_calls";
        } else if ("max_tokens".equals(stopReason)) {
            finishReason = "length";
        }

        JSONObject choice = new JSONObject();
        choice.put("index", 0);
        choice.put("message", message);
        choice.put("finish_reason", finishReason);
        JSONArray choices = new JSONArray();
        choices.put(choice);
        out.put("choices", choices);

        JSONObject usage = anthResp.optJSONObject("usage");
        JSONObject oaiUsage = new JSONObject();
        int inTok = usage != null ? usage.optInt("input_tokens", 0) : 0;
        int outTok = usage != null ? usage.optInt("output_tokens", 0) : 0;
        oaiUsage.put("prompt_tokens", inTok);
        oaiUsage.put("completion_tokens", outTok);
        oaiUsage.put("total_tokens", inTok + outTok);
        out.put("usage", oaiUsage);

        return out;
    }

    /**
     * Streams an Anthropic /v1/messages SSE stream and translates each event into OpenAI
     * chat.completion.chunk SSE events in real time.
     */
    private static void streamAnthropicSseToOpenAi(InputStream anthropicStream,
                                                   String fallbackModel,
                                                   OutputStream clientOut) throws Exception {
        String statusHeaders = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/event-stream; charset=utf-8\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Connection: close\r\n\r\n";
        clientOut.write(statusHeaders.getBytes(StandardCharsets.UTF_8));
        clientOut.flush();

        if (anthropicStream == null) {
            clientOut.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
            clientOut.flush();
            return;
        }

        String msgId = "chatcmpl-" + System.currentTimeMillis();
        String modelName = fallbackModel;
        long created = System.currentTimeMillis() / 1000L;
        int currentToolCallIndex = -1;
        int inputTokens = 0;
        int outputTokens = 0;
        boolean sentRoleChunk = false;

        try (java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(anthropicStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (!trimmed.startsWith("data:")) {
                    continue;
                }
                String dataStr = trimmed.substring(5).trim();
                if (dataStr.isEmpty() || "[DONE]".equals(dataStr)) {
                    continue;
                }
                JSONObject ev;
                try {
                    ev = new JSONObject(dataStr);
                } catch (Exception ignored) {
                    continue;
                }
                String type = ev.optString("type", "");

                if ("message_start".equals(type)) {
                    JSONObject msg = ev.optJSONObject("message");
                    if (msg != null) {
                        msgId = msg.optString("id", msgId);
                        modelName = msg.optString("model", modelName);
                        JSONObject usage = msg.optJSONObject("usage");
                        if (usage != null) {
                            inputTokens = usage.optInt("input_tokens", 0);
                        }
                    }
                    if (!sentRoleChunk) {
                        sentRoleChunk = true;
                        JSONObject delta = new JSONObject();
                        delta.put("role", "assistant");
                        delta.put("content", "");
                        writeOpenAiSseChunk(clientOut, msgId, created, modelName, delta, null, null);
                    }
                } else if ("content_block_start".equals(type)) {
                    JSONObject block = ev.optJSONObject("content_block");
                    if (block != null && "tool_use".equals(block.optString("type"))) {
                        currentToolCallIndex++;
                        JSONObject tc = new JSONObject();
                        tc.put("index", currentToolCallIndex);
                        tc.put("id", block.optString("id", "call_" + currentToolCallIndex));
                        tc.put("type", "function");
                        JSONObject fn = new JSONObject();
                        fn.put("name", block.optString("name", ""));
                        fn.put("arguments", "");
                        tc.put("function", fn);
                        JSONArray tcArr = new JSONArray();
                        tcArr.put(tc);
                        JSONObject delta = new JSONObject();
                        if (!sentRoleChunk) {
                            sentRoleChunk = true;
                            delta.put("role", "assistant");
                        }
                        delta.put("tool_calls", tcArr);
                        writeOpenAiSseChunk(clientOut, msgId, created, modelName, delta, null, null);
                    }
                } else if ("content_block_delta".equals(type)) {
                    JSONObject d = ev.optJSONObject("delta");
                    if (d == null) continue;
                    String dType = d.optString("type", "");
                    if ("text_delta".equals(dType)) {
                        String text = d.optString("text", "");
                        if (!text.isEmpty()) {
                            JSONObject delta = new JSONObject();
                            if (!sentRoleChunk) {
                                sentRoleChunk = true;
                                delta.put("role", "assistant");
                            }
                            delta.put("content", text);
                            writeOpenAiSseChunk(clientOut, msgId, created, modelName, delta, null, null);
                        }
                    } else if ("thinking_delta".equals(dType)) {
                        String thinking = d.optString("thinking", "");
                        if (!thinking.isEmpty()) {
                            JSONObject delta = new JSONObject();
                            if (!sentRoleChunk) {
                                sentRoleChunk = true;
                                delta.put("role", "assistant");
                            }
                            delta.put("reasoning_content", thinking);
                            writeOpenAiSseChunk(clientOut, msgId, created, modelName, delta, null, null);
                        }
                    } else if ("input_json_delta".equals(dType)) {
                        String partialJson = d.optString("partial_json", "");
                        if (!partialJson.isEmpty()) {
                            JSONObject tc = new JSONObject();
                            tc.put("index", Math.max(0, currentToolCallIndex));
                            JSONObject fn = new JSONObject();
                            fn.put("arguments", partialJson);
                            tc.put("function", fn);
                            JSONArray tcArr = new JSONArray();
                            tcArr.put(tc);
                            JSONObject delta = new JSONObject();
                            delta.put("tool_calls", tcArr);
                            writeOpenAiSseChunk(clientOut, msgId, created, modelName, delta, null, null);
                        }
                    }
                } else if ("message_delta".equals(type)) {
                    JSONObject d = ev.optJSONObject("delta");
                    JSONObject u = ev.optJSONObject("usage");
                    if (u != null) {
                        outputTokens = u.optInt("output_tokens", outputTokens);
                    }
                    String stopReason = d != null ? d.optString("stop_reason", "end_turn") : "end_turn";
                    String finishReason = "stop";
                    if ("tool_use".equals(stopReason) || currentToolCallIndex >= 0) {
                        finishReason = "tool_calls";
                    } else if ("max_tokens".equals(stopReason)) {
                        finishReason = "length";
                    }
                    JSONObject usageObj = new JSONObject();
                    usageObj.put("prompt_tokens", inputTokens);
                    usageObj.put("completion_tokens", outputTokens);
                    usageObj.put("total_tokens", inputTokens + outputTokens);
                    writeOpenAiSseChunk(clientOut, msgId, created, modelName, new JSONObject(), finishReason, usageObj);
                } else if ("error".equals(type)) {
                    JSONObject errObj = ev.optJSONObject("error");
                    String errMsg = errObj != null ? errObj.optString("message", "Anthropic stream error") : "Anthropic stream error";
                    JSONObject delta = new JSONObject();
                    delta.put("content", "\n\n[Anthropic Error: " + errMsg + "]");
                    writeOpenAiSseChunk(clientOut, msgId, created, modelName, delta, "stop", null);
                }
            }
        }

        clientOut.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
        clientOut.flush();
    }

    private static void writeAnthropicJsonAsOpenAiSse(String jsonBody, String fallbackModel,
                                                      OutputStream clientOut) throws Exception {
        String statusHeaders = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/event-stream; charset=utf-8\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Connection: close\r\n\r\n";
        clientOut.write(statusHeaders.getBytes(StandardCharsets.UTF_8));
        JSONObject anthResp = new JSONObject(jsonBody);
        JSONObject oaiResp = convertAnthropicToOpenAiResponse(anthResp, fallbackModel);
        String msgId = oaiResp.optString("id", "chatcmpl-" + System.currentTimeMillis());
        long created = oaiResp.optLong("created", System.currentTimeMillis() / 1000L);
        String model = oaiResp.optString("model", fallbackModel);

        JSONArray choices = oaiResp.optJSONArray("choices");
        if (choices != null && choices.length() > 0) {
            JSONObject c0 = choices.optJSONObject(0);
            JSONObject msg = c0 != null ? c0.optJSONObject("message") : null;
            String finishReason = c0 != null ? c0.optString("finish_reason", "stop") : "stop";
            if (msg != null) {
                JSONObject delta = new JSONObject();
                delta.put("role", "assistant");
                if (!msg.isNull("content")) {
                    delta.put("content", msg.optString("content", ""));
                }
                if (msg.has("tool_calls")) {
                    JSONArray tcs = msg.optJSONArray("tool_calls");
                    if (tcs != null) {
                        for (int i = 0; i < tcs.length(); i++) {
                            JSONObject tc = tcs.optJSONObject(i);
                            if (tc != null) tc.put("index", i);
                        }
                        delta.put("tool_calls", tcs);
                    }
                }
                writeOpenAiSseChunk(clientOut, msgId, created, model, delta, null, null);
                writeOpenAiSseChunk(clientOut, msgId, created, model, new JSONObject(),
                        finishReason, oaiResp.optJSONObject("usage"));
            }
        }
        clientOut.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
        clientOut.flush();
    }

    private static void writeOpenAiSseChunk(OutputStream clientOut, String id, long created,
                                            String model, JSONObject delta, String finishReason,
                                            JSONObject usage) throws Exception {
        JSONObject chunk = new JSONObject();
        chunk.put("id", id);
        chunk.put("object", "chat.completion.chunk");
        chunk.put("created", created);
        chunk.put("model", model);

        JSONObject choice = new JSONObject();
        choice.put("index", 0);
        choice.put("delta", delta != null ? delta : new JSONObject());
        choice.put("finish_reason", finishReason != null ? finishReason : JSONObject.NULL);
        JSONArray choices = new JSONArray();
        choices.put(choice);
        chunk.put("choices", choices);
        if (usage != null) {
            chunk.put("usage", usage);
        }

        String line = "data: " + chunk.toString() + "\n\n";
        clientOut.write(line.getBytes(StandardCharsets.UTF_8));
        clientOut.flush();
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
                        if (p.optString("apiKey", "").trim().isEmpty() && !isKeylessAllowedProvider(pid)) continue;
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
                        dProv.put("baseUrl", sProv.optString("baseUrl", "").trim());
                    }
                    if (sProv.has("wireProtocol") && !sProv.optString("wireProtocol", "").trim().isEmpty()) {
                        String savedProto = sProv.optString("wireProtocol", "").trim();
                        // Upgrade legacy default 'openai' on anthropic provider to native 'anthropic'
                        if ("anthropic".equals(k) && "openai".equals(savedProto)
                                && dProv.optString("baseUrl", "").contains("api.anthropic.com")) {
                            savedProto = "anthropic";
                        }
                        dProv.put("wireProtocol", savedProto);
                    }
                    if (sProv.has("customHeaders") && sProv.optJSONObject("customHeaders") != null) {
                        dProv.put("customHeaders", sProv.optJSONObject("customHeaders"));
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

    private static JSONArray buildDefaultAnthropicModelsArray() throws Exception {
        JSONArray arr = new JSONArray();
        arr.put(makeModel("claude-sonnet-4-5-20250929", "Claude 4.5 Sonnet", true, true, 200000L, 64000L));
        arr.put(makeModel("claude-sonnet-4-20250514", "Claude 4 Sonnet", true, true, 200000L, 64000L));
        arr.put(makeModel("claude-opus-4-20250514", "Claude 4 Opus", true, true, 200000L, 32000L));
        arr.put(makeModel("claude-3-7-sonnet-latest", "Claude 3.7 Sonnet", true, true, 200000L, 64000L));
        arr.put(makeModel("claude-3-5-haiku-latest", "Claude 3.5 Haiku", false, true, 200000L, 8192L));
        return arr;
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

            // 3. Anthropic Claude (Native /v1/messages protocol)
            providers.put("anthropic", makeProvider(
                    "Anthropic Claude",
                    "Claude 4.5 / 4 Sonnet, Opus 4 & Claude 3.7 via Anthropic Messages API (/v1/messages)",
                    "https://api.anthropic.com/v1",
                    "anthropic",
                    new JSONObject[]{
                            makeModel("claude-sonnet-4-5-20250929", "Claude 4.5 Sonnet", true, true, 200000L, 64000L),
                            makeModel("claude-sonnet-4-20250514", "Claude 4 Sonnet", true, true, 200000L, 64000L),
                            makeModel("claude-opus-4-20250514", "Claude 4 Opus", true, true, 200000L, 32000L),
                            makeModel("claude-3-7-sonnet-latest", "Claude 3.7 Sonnet", true, true, 200000L, 64000L),
                            makeModel("claude-3-5-haiku-latest", "Claude 3.5 Haiku", false, true, 200000L, 8192L)
                    }
            ));

            // 4. Custom Anthropic Endpoint (Any Anthropic /v1/messages compatible proxy or provider)
            providers.put("custom_anthropic", makeProvider(
                    "Custom Anthropic Endpoint",
                    "Any Anthropic Messages API (/v1/messages) compatible endpoint, proxy, or relay (Claude Proxy, LiteLLM, Bedrock Gateway, Zhipu GLM, MiniMax, etc.)",
                    "https://api.anthropic.com/v1",
                    "anthropic",
                    new JSONObject[]{
                            makeModel("claude-sonnet-4-5-20250929", "Claude 4.5 Sonnet (Custom)", true, true, 200000L, 64000L),
                            makeModel("claude-sonnet-4-20250514", "Claude 4 Sonnet (Custom)", true, true, 200000L, 64000L),
                            makeModel("claude-opus-4-20250514", "Claude 4 Opus (Custom)", true, true, 200000L, 32000L),
                            makeModel("claude-3-7-sonnet-latest", "Claude 3.7 Sonnet (Custom)", true, true, 200000L, 64000L)
                    }
            ));

            // 5. OpenRouter
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

            // 6. DeepSeek
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

            // 7. Groq Cloud
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

            // 8. xAI Grok
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

            // 9. Mistral AI
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

            // 10. Custom OpenAI / Anthropic / Gemini Compatible Endpoint
            providers.put("custom", makeProvider(
                    "Custom Endpoint / Local LLM",
                    "Any OpenAI-, Anthropic-, or Gemini-compatible endpoint (Ollama, vLLM, LiteLLM, Together, Fireworks, etc.)",
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
        p.put("customHeaders", new JSONObject());
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
