/**
 * patches/ai_models_menu/config.js - State, default provider catalog, and bridge I/O.
 *
 * First fragment of patches/ai_models_menu.js: owns the guard and shared scope.
 */
'use strict';

if (window.__agAiModels && window.__agAiModels.__installed) {
  return;
}

var STORAGE_KEY = 'agy_ai_models_config_v1';

var PROVIDER_ORDER = [
  'gemini',
  'openrouter',
  'openai',
  'anthropic',
  'custom_anthropic',
  'deepseek',
  'groq',
  'xai',
  'mistral',
  'multi',
  'custom'
];

var PROVIDER_META = {
  gemini: {
    id: 'gemini',
    shortName: 'Gemini API',
    badge: 'Google AI Studio',
    placeholderKey: 'AIzaSy...',
    helpText: 'Get a free or paid API key from aistudio.google.com/apikey'
  },
  openrouter: {
    id: 'openrouter',
    shortName: 'OpenRouter',
    badge: 'Multi-Model',
    placeholderKey: 'sk-or-v1-...',
    helpText: 'Use a single API key from openrouter.ai/keys for Claude, Gemini, GPT, DeepSeek, Llama, and Qwen'
  },
  openai: {
    id: 'openai',
    shortName: 'OpenAI',
    badge: 'GPT / o-series',
    placeholderKey: 'sk-proj-...',
    helpText: 'Get your API key from platform.openai.com/api-keys'
  },
  anthropic: {
    id: 'anthropic',
    shortName: 'Anthropic Claude',
    badge: 'Claude 4.5 / 4',
    placeholderKey: 'sk-ant-api03-...',
    helpText: 'Official Anthropic Claude API or custom Anthropic base URL using native /v1/messages protocol'
  },
  custom_anthropic: {
    id: 'custom_anthropic',
    shortName: 'Custom Anthropic',
    badge: 'Anthropic /v1/messages',
    placeholderKey: 'sk-ant-... or proxy token (optional)',
    helpText: 'Connect any Anthropic Messages API (/v1/messages) compatible endpoint, proxy, or relay (Claude Proxy, LiteLLM, Bedrock Gateway, Zhipu GLM, MiniMax, etc.)'
  },
  deepseek: {
    id: 'deepseek',
    shortName: 'DeepSeek',
    badge: 'V3 & R1',
    placeholderKey: 'sk-...',
    helpText: 'Get your API key from platform.deepseek.com/api_keys'
  },
  groq: {
    id: 'groq',
    shortName: 'Groq Cloud',
    badge: 'Fast LPU',
    placeholderKey: 'gsk_...',
    helpText: 'Get your API key from console.groq.com/keys'
  },
  xai: {
    id: 'xai',
    shortName: 'xAI (Grok)',
    badge: 'Grok 3',
    placeholderKey: 'xai-...',
    helpText: 'Get your API key from console.x.ai'
  },
  mistral: {
    id: 'mistral',
    shortName: 'Mistral / Codestral',
    badge: 'Coding',
    placeholderKey: '...',
    helpText: 'Get your API key from console.mistral.ai'
  },
  multi: {
    id: 'multi',
    shortName: 'Multi-Provider',
    badge: 'Combine All Keys',
    placeholderKey: '',
    helpText: 'Combines active models from all providers that have a configured API key into a single unified model selector.'
  },
  custom: {
    id: 'custom',
    shortName: 'Custom / Local',
    badge: 'OpenAI / Anthropic / GenAI',
    placeholderKey: 'sk-... (optional for local Ollama)',
    helpText: 'Connect any OpenAI-, Anthropic-, or Gemini-compatible server (Ollama, vLLM, LiteLLM, Together, Fireworks, etc.).'
  }
};

var ENDPOINT_PRESETS = {
  anthropic: [
    { label: 'Official Anthropic', baseUrl: 'https://api.anthropic.com/v1', wireProtocol: 'anthropic' },
    { label: 'Anthropic (OpenAI Compat)', baseUrl: 'https://api.anthropic.com/v1', wireProtocol: 'openai' }
  ],
  custom_anthropic: [
    { label: 'Anthropic Official', baseUrl: 'https://api.anthropic.com/v1', wireProtocol: 'anthropic' },
    { label: 'LiteLLM / Local Proxy', baseUrl: 'http://127.0.0.1:4000/v1', wireProtocol: 'anthropic' },
    { label: 'Zhipu GLM (Anthropic)', baseUrl: 'https://open.bigmodel.cn/api/anthropic/v1', wireProtocol: 'anthropic' },
    { label: 'MiniMax (Anthropic)', baseUrl: 'https://api.minimax.io/anthropic/v1', wireProtocol: 'anthropic' }
  ],
  custom: [
    { label: 'Ollama Local', baseUrl: 'http://127.0.0.1:11434/v1', wireProtocol: 'openai' },
    { label: 'LiteLLM Proxy', baseUrl: 'http://127.0.0.1:4000/v1', wireProtocol: 'openai' },
    { label: 'Custom Anthropic (/v1/messages)', baseUrl: 'https://api.anthropic.com/v1', wireProtocol: 'anthropic' },
    { label: 'Custom Gemini (/v1beta)', baseUrl: 'https://generativelanguage.googleapis.com', wireProtocol: 'genai' }
  ]
};

function resolveEndpointPreviewUrl(providerId, rawBaseUrl, wireProtocol) {
  var url = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
  if (!url) return '(enter a Base URL above)';
  var proto = String(wireProtocol || 'openai').toLowerCase();
  if (proto === 'anthropic') {
    if (url.endsWith('/messages')) return 'POST ' + url;
    if (url.endsWith('/chat/completions')) url = url.slice(0, -'/chat/completions'.length);
    if (url.endsWith('/v1') || url.endsWith('/v1beta') || url.endsWith('/anthropic')) {
      return 'POST ' + url + '/messages';
    }
    return 'POST ' + url + '/v1/messages';
  }
  if (proto === 'genai') {
    var base = url.endsWith('/v1beta') ? url : url + '/v1beta';
    return 'POST ' + base + '/models/{model}:streamGenerateContent';
  }
  if (url.endsWith('/chat/completions')) return 'POST ' + url;
  if (url.endsWith('/messages')) url = url.slice(0, -'/messages'.length);
  if (url.endsWith('/v1') || url.endsWith('/openai') || url.endsWith('/v1beta')) {
    return 'POST ' + url + '/chat/completions';
  }
  return 'POST ' + url + '/v1/chat/completions';
}

function getDefaultConfig() {
  return {
    enabled: false,
    activeProvider: 'gemini',
    providers: {
      gemini: {
        name: 'Google Gemini API',
        description: 'Use an API key from Google AI Studio (aistudio.google.com)',
        apiKey: '',
        baseUrl: 'https://generativelanguage.googleapis.com',
        wireProtocol: 'genai',
        customHeaders: {},
        models: [
          { modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportsThinking: true, enabled: true, maxTokens: 1048576, maxOutputTokens: 65536 },
          { modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportsThinking: true, enabled: true, maxTokens: 1048576, maxOutputTokens: 65536 },
          { modelId: 'gemini-2.5-flash-lite-preview-06-17', displayName: 'Gemini 2.5 Flash-Lite', supportsThinking: true, enabled: true, maxTokens: 1048576, maxOutputTokens: 65536 },
          { modelId: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportsThinking: false, enabled: true, maxTokens: 1048576, maxOutputTokens: 8192 }
        ]
      },
      openrouter: {
        name: 'OpenRouter (All AI Models)',
        description: 'Access hundreds of AI models (Claude, Gemini, GPT, DeepSeek, Llama, Qwen) with a single API key',
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        wireProtocol: 'openai',
        customHeaders: {},
        models: [
          { modelId: 'anthropic/claude-sonnet-4', displayName: 'Claude 4 Sonnet (OpenRouter)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'anthropic/claude-3.7-sonnet', displayName: 'Claude 3.7 Sonnet (OpenRouter)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'google/gemini-2.5-pro-preview', displayName: 'Gemini 2.5 Pro (OpenRouter)', supportsThinking: true, enabled: true, maxTokens: 1048576, maxOutputTokens: 65536 },
          { modelId: 'google/gemini-2.5-flash-preview', displayName: 'Gemini 2.5 Flash (OpenRouter)', supportsThinking: true, enabled: true, maxTokens: 1048576, maxOutputTokens: 65536 },
          { modelId: 'openai/gpt-4.1', displayName: 'GPT-4.1 (OpenRouter)', supportsThinking: false, enabled: true, maxTokens: 1047576, maxOutputTokens: 32768 },
          { modelId: 'deepseek/deepseek-r1', displayName: 'DeepSeek R1 (OpenRouter)', supportsThinking: true, enabled: true, maxTokens: 128000, maxOutputTokens: 32768 },
          { modelId: 'deepseek/deepseek-chat-v3-0324', displayName: 'DeepSeek V3 (OpenRouter)', supportsThinking: false, enabled: true, maxTokens: 128000, maxOutputTokens: 16384 },
          { modelId: 'qwen/qwq-32b', displayName: 'Qwen QwQ 32B (OpenRouter)', supportsThinking: true, enabled: true, maxTokens: 128000, maxOutputTokens: 16384 }
        ]
      },
      openai: {
        name: 'OpenAI',
        description: 'GPT-4.1, GPT-4o, o3, and o4-mini via OpenAI API Key',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        wireProtocol: 'openai',
        customHeaders: {},
        models: [
          { modelId: 'gpt-4.1', displayName: 'GPT-4.1', supportsThinking: false, enabled: true, maxTokens: 1047576, maxOutputTokens: 32768 },
          { modelId: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', supportsThinking: false, enabled: true, maxTokens: 1047576, maxOutputTokens: 32768 },
          { modelId: 'gpt-4o', displayName: 'GPT-4o', supportsThinking: false, enabled: true, maxTokens: 128000, maxOutputTokens: 16384 },
          { modelId: 'o4-mini', displayName: 'OpenAI o4-mini (Reasoning)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 100000 },
          { modelId: 'o3', displayName: 'OpenAI o3 (Reasoning)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 100000 }
        ]
      },
      anthropic: {
        name: 'Anthropic Claude',
        description: 'Claude 4.5 / 4 Sonnet, Opus 4 & Claude 3.7 via Anthropic Messages API (/v1/messages)',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com/v1',
        wireProtocol: 'anthropic',
        customHeaders: {},
        models: [
          { modelId: 'claude-sonnet-4-5-20250929', displayName: 'Claude 4.5 Sonnet', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'claude-sonnet-4-20250514', displayName: 'Claude 4 Sonnet', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'claude-opus-4-20250514', displayName: 'Claude 4 Opus', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 32000 },
          { modelId: 'claude-3-7-sonnet-latest', displayName: 'Claude 3.7 Sonnet', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku', supportsThinking: false, enabled: true, maxTokens: 200000, maxOutputTokens: 8192 }
        ]
      },
      custom_anthropic: {
        name: 'Custom Anthropic Endpoint',
        description: 'Any Anthropic Messages API (/v1/messages) compatible endpoint, proxy, or relay',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com/v1',
        wireProtocol: 'anthropic',
        customHeaders: {},
        models: [
          { modelId: 'claude-sonnet-4-5-20250929', displayName: 'Claude 4.5 Sonnet (Custom)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'claude-sonnet-4-20250514', displayName: 'Claude 4 Sonnet (Custom)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'claude-opus-4-20250514', displayName: 'Claude 4 Opus (Custom)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 32000 },
          { modelId: 'claude-3-7-sonnet-latest', displayName: 'Claude 3.7 Sonnet (Custom)', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 }
        ]
      },
      deepseek: {
        name: 'DeepSeek',
        description: 'Official DeepSeek V3 (Chat) & DeepSeek R1 (Reasoner)',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        wireProtocol: 'openai',
        customHeaders: {},
        models: [
          { modelId: 'deepseek-chat', displayName: 'DeepSeek V3 (Chat)', supportsThinking: false, enabled: true, maxTokens: 64000, maxOutputTokens: 8192 },
          { modelId: 'deepseek-reasoner', displayName: 'DeepSeek R1 (Reasoner)', supportsThinking: true, enabled: true, maxTokens: 64000, maxOutputTokens: 8192 }
        ]
      },
      groq: {
        name: 'Groq Cloud',
        description: 'Ultra-fast LPU inference for Llama 3.3, DeepSeek R1 Distill, and Qwen QwQ',
        apiKey: '',
        baseUrl: 'https://api.groq.com/openai/v1',
        wireProtocol: 'openai',
        customHeaders: {},
        models: [
          { modelId: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B Versatile', supportsThinking: false, enabled: true, maxTokens: 128000, maxOutputTokens: 32768 },
          { modelId: 'deepseek-r1-distill-llama-70b', displayName: 'DeepSeek R1 Distill Llama 70B', supportsThinking: true, enabled: true, maxTokens: 128000, maxOutputTokens: 16384 },
          { modelId: 'qwen-qwq-32b', displayName: 'Qwen QwQ 32B', supportsThinking: true, enabled: true, maxTokens: 128000, maxOutputTokens: 16384 },
          { modelId: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant', supportsThinking: false, enabled: true, maxTokens: 128000, maxOutputTokens: 8192 }
        ]
      },
      xai: {
        name: 'xAI (Grok)',
        description: 'Grok 3 & Grok 3 Mini via xAI API Key',
        apiKey: '',
        baseUrl: 'https://api.x.ai/v1',
        wireProtocol: 'openai',
        customHeaders: {},
        models: [
          { modelId: 'grok-3-beta', displayName: 'Grok 3', supportsThinking: false, enabled: true, maxTokens: 131072, maxOutputTokens: 16384 },
          { modelId: 'grok-3-mini-beta', displayName: 'Grok 3 Mini (Reasoning)', supportsThinking: true, enabled: true, maxTokens: 131072, maxOutputTokens: 16384 }
        ]
      },
      mistral: {
        name: 'Mistral AI / Codestral',
        description: 'Codestral & Mistral Large via Mistral API Key',
        apiKey: '',
        baseUrl: 'https://api.mistral.ai/v1',
        wireProtocol: 'openai',
        customHeaders: {},
        models: [
          { modelId: 'codestral-latest', displayName: 'Codestral (Coding)', supportsThinking: false, enabled: true, maxTokens: 256000, maxOutputTokens: 16384 },
          { modelId: 'mistral-large-latest', displayName: 'Mistral Large', supportsThinking: false, enabled: true, maxTokens: 128000, maxOutputTokens: 16384 }
        ]
      },
      custom: {
        name: 'Custom Endpoint / Local LLM',
        description: 'OpenAI-, Anthropic-, or Gemini-compatible custom endpoint (Ollama, vLLM, LiteLLM, Together, etc.)',
        apiKey: '',
        baseUrl: 'http://127.0.0.1:11434/v1',
        wireProtocol: 'openai',
        customHeaders: {},
        models: [
          { modelId: 'qwen2.5-coder:7b', displayName: 'Qwen 2.5 Coder 7B (Local)', supportsThinking: false, enabled: true, maxTokens: 128000, maxOutputTokens: 8192 }
        ]
      }
    }
  };
}

function getBridgeToken() {
  return window.__AG_NATIVE_BRIDGE_TOKEN__ || '';
}

function mergeConfigs(defaults, loaded) {
  if (!loaded || typeof loaded !== 'object') return defaults;
  var out = JSON.parse(JSON.stringify(defaults));
  if (typeof loaded.enabled === 'boolean') out.enabled = loaded.enabled;
  if (typeof loaded.activeProvider === 'string' && loaded.activeProvider) {
    out.activeProvider = loaded.activeProvider;
  }
  if (loaded.providers && typeof loaded.providers === 'object') {
    Object.keys(loaded.providers).forEach(function (pid) {
      var src = loaded.providers[pid];
      if (!src || typeof src !== 'object') return;
      if (!out.providers[pid]) {
        out.providers[pid] = src;
        return;
      }
      var dst = out.providers[pid];
      if (typeof src.apiKey === 'string') dst.apiKey = src.apiKey;
      if (typeof src.baseUrl === 'string' && src.baseUrl.trim()) dst.baseUrl = src.baseUrl.trim();
      if (typeof src.wireProtocol === 'string' && src.wireProtocol.trim()) {
        var proto = src.wireProtocol.trim();
        if (pid === 'anthropic' && proto === 'openai' && dst.baseUrl.indexOf('api.anthropic.com') !== -1) {
          proto = 'anthropic';
        }
        dst.wireProtocol = proto;
      }
      if (src.customHeaders && typeof src.customHeaders === 'object' && !Array.isArray(src.customHeaders)) {
        dst.customHeaders = src.customHeaders;
      }
      if (Array.isArray(src.models) && src.models.length > 0) {
        dst.models = src.models;
      }
    });
  }
  return out;
}

function loadAiConfig() {
  var defaults = getDefaultConfig();
  try {
    if (window.Android && typeof window.Android.getAiConfig === 'function') {
      var raw = window.Android.getAiConfig(getBridgeToken());
      if (raw && raw !== '{}') {
        var parsed = JSON.parse(raw);
        var merged = mergeConfigs(defaults, parsed);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (_) {}
        return merged;
      }
    }
  } catch (e) {
    console.warn('[AGY AI Models] Failed to read from AndroidBridge:', e);
  }
  try {
    var local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      return mergeConfigs(defaults, JSON.parse(local));
    }
  } catch (_) {}
  return defaults;
}

function saveAiConfigToBridge(cfg) {
  var jsonStr = JSON.stringify(cfg);
  try {
    localStorage.setItem(STORAGE_KEY, jsonStr);
  } catch (_) {}
  try {
    if (window.Android && typeof window.Android.saveAiConfig === 'function') {
      return Boolean(window.Android.saveAiConfig(getBridgeToken(), jsonStr));
    }
    return true;
  } catch (e) {
    console.error('[AGY AI Models] saveAiConfig error:', e);
    return false;
  }
}

function fetchProviderModelsFromBridge(providerId, baseUrl, apiKey, wireProtocol) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      try {
        if (window.Android && typeof window.Android.fetchAiModels === 'function') {
          var resStr = window.Android.fetchAiModels(
            getBridgeToken(),
            String(providerId || ''),
            String(baseUrl || ''),
            String(apiKey || ''),
            String(wireProtocol || 'openai')
          );
          resolve(JSON.parse(resStr || '{"ok":false,"error":"Empty response"}'));
          return;
        }
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message ? e.message : e) });
        return;
      }
      resolve({ ok: false, error: 'Android bridge is not available in this environment.' });
    }, 30);
  });
}

function waitForCoreRestart(maxWaitMs) {
  var start = Date.now();
  var limit = maxWaitMs || 12000;
  return new Promise(function (resolve) {
    // Wait 900ms first so supervisor begins stopping old process
    setTimeout(function poll() {
      if (Date.now() - start >= limit) {
        resolve(true);
        return;
      }
      try {
        if (window.Android && typeof window.Android.checkEngineReady === 'function') {
          if (window.Android.checkEngineReady(getBridgeToken())) {
            resolve(true);
            return;
          }
        } else {
          resolve(true);
          return;
        }
      } catch (_) {}
      setTimeout(poll, 350);
    }, 900);
  });
}
