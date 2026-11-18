(function(){
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
    badge: 'Claude 4 / 3.7',
    placeholderKey: 'sk-ant-api03-...',
    helpText: 'Get your API key from console.anthropic.com/settings/keys'
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
    badge: 'OpenAI / GenAI',
    placeholderKey: 'sk-... (optional for local Ollama)',
    helpText: 'Connect any OpenAI- or Gemini-compatible server (Ollama, vLLM, LiteLLM, Together, Fireworks, etc.).'
  }
};

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
        description: 'Claude 4 Opus/Sonnet & Claude 3.7 Sonnet via Anthropic API Key',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com/v1',
        wireProtocol: 'openai',
        models: [
          { modelId: 'claude-sonnet-4-20250514', displayName: 'Claude 4 Sonnet', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'claude-opus-4-20250514', displayName: 'Claude 4 Opus', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 32000 },
          { modelId: 'claude-3-7-sonnet-latest', displayName: 'Claude 3.7 Sonnet', supportsThinking: true, enabled: true, maxTokens: 200000, maxOutputTokens: 64000 },
          { modelId: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku', supportsThinking: false, enabled: true, maxTokens: 200000, maxOutputTokens: 8192 }
        ]
      },
      deepseek: {
        name: 'DeepSeek',
        description: 'Official DeepSeek V3 (Chat) & DeepSeek R1 (Reasoner)',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        wireProtocol: 'openai',
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
        models: [
          { modelId: 'codestral-latest', displayName: 'Codestral (Coding)', supportsThinking: false, enabled: true, maxTokens: 256000, maxOutputTokens: 16384 },
          { modelId: 'mistral-large-latest', displayName: 'Mistral Large', supportsThinking: false, enabled: true, maxTokens: 128000, maxOutputTokens: 16384 }
        ]
      },
      custom: {
        name: 'Custom Endpoint / Local LLM',
        description: 'OpenAI- or Gemini-compatible custom endpoint (Ollama, vLLM, LiteLLM, Together, etc.)',
        apiKey: '',
        baseUrl: 'http://127.0.0.1:11434/v1',
        wireProtocol: 'openai',
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
      if (typeof src.wireProtocol === 'string' && src.wireProtocol.trim()) dst.wireProtocol = src.wireProtocol.trim();
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

/**
 * patches/ai_models_menu/styles.js - Theme-aware CSS for the AI Models & API Keys UI.
 */

var STYLE_ID = 'agy-ai-models-styles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '.agy-ai-backdrop {',
    '  position: fixed; inset: 0; z-index: 99998;',
    '  background: rgba(0, 0, 0, 0.62);',
    '  backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 12px; animation: agyAiFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);',
    '}',
    '@keyframes agyAiFadeIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }',
    '.agy-ai-modal {',
    '  width: 100%; max-width: 680px; max-height: min(calc(var(--agy-vvh, 100vh) - 20px), 760px);',
    '  background: var(--card, #141824); color: var(--foreground, #f1f5f9);',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.22));',
    '  border-radius: 16px; box-shadow: 0 22px 55px rgba(0, 0, 0, 0.55);',
    '  display: flex; flex-direction: column; overflow: hidden;',
    '  font-family: inherit;',
    '}',
    '.agy-ai-drag-pill {',
    '  width: 38px; height: 4px; border-radius: 999px;',
    '  background: rgba(148, 163, 184, 0.36); margin: 8px auto 0 auto; display: none;',
    '}',
    '@media (max-width: 640px) {',
    '  .agy-ai-backdrop { align-items: flex-end; padding: 0; }',
    '  .agy-ai-modal {',
    '    max-width: 100%; max-height: calc(var(--agy-vvh, 100vh) - 12px);',
    '    border-radius: 20px 20px 0 0; border-bottom: none;',
    '  }',
    '  .agy-ai-drag-pill { display: block; }',
    '}',
    'html.light .agy-ai-modal {',
    '  background: #ffffff; color: #0f172a;',
    '  border-color: rgba(15, 23, 42, 0.15);',
    '  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);',
    '}',
    '.agy-ai-header {',
    '  padding: 12px 18px 14px 18px; border-bottom: 1px solid var(--border, rgba(148, 163, 184, 0.18));',
    '  display: flex; align-items: center; justify-content: space-between; gap: 12px;',
    '}',
    '.agy-ai-title { font-size: 16px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px; }',
    '.agy-ai-subtitle { font-size: 12px; opacity: 0.72; margin-top: 2px; line-height: 1.35; }',
    '.agy-ai-body {',
    '  padding: 16px 18px; overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; display: flex; flex-direction: column; gap: 16px;',
    '}',
    '.agy-ai-footer {',
    '  padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px)) 18px; border-top: 1px solid var(--border, rgba(148, 163, 184, 0.18));',
    '  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;',
    '  background: rgba(128, 128, 128, 0.04);',
    '}',
    '.agy-ai-mode-bar {',
    '  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;',
    '  background: rgba(128, 128, 128, 0.1); padding: 4px; border-radius: 10px;',
    '}',
    '.agy-ai-mode-btn {',
    '  border: none; background: transparent; color: inherit;',
    '  padding: 10px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600;',
    '  cursor: pointer; transition: all 0.15s ease; text-align: center; min-height: 38px;',
    '}',
    '.agy-ai-mode-btn.active {',
    '  background: #0284c7; color: #ffffff; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.35);',
    '}',
    '.agy-ai-providers-grid {',
    '  display: grid; grid-template-columns: repeat(auto-fill, minmax(138px, 1fr)); gap: 7px;',
    '}',
    '.agy-ai-prov-btn {',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.22));',
    '  background: rgba(128, 128, 128, 0.05); color: inherit;',
    '  padding: 8px 10px; border-radius: 9px; cursor: pointer;',
    '  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;',
    '  text-align: left; transition: all 0.15s ease; position: relative;',
    '}',
    '.agy-ai-prov-btn.active {',
    '  border-color: #38bdf8; background: rgba(56, 189, 248, 0.13);',
    '}',
    'html.light .agy-ai-prov-btn.active {',
    '  border-color: #0284c7; background: rgba(2, 132, 199, 0.1);',
    '}',
    '.agy-ai-prov-name { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 5px; width: 100%; justify-content: space-between; }',
    '.agy-ai-prov-badge { font-size: 10.5px; opacity: 0.7; }',
    '.agy-ai-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; display: inline-block; flex-shrink: 0; }',
    '.agy-ai-section {',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.2));',
    '  border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;',
    '  background: rgba(128, 128, 128, 0.03);',
    '}',
    '.agy-ai-label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 4px; }',
    '.agy-ai-hint { font-size: 11.5px; opacity: 0.75; line-height: 1.45; }',
    '.agy-ai-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; }',
    '.agy-ai-input, .agy-ai-select {',
    '  flex: 1; min-width: 140px; height: 38px; padding: 0 11px;',
    '  border-radius: 8px; border: 1px solid var(--border, rgba(148, 163, 184, 0.28));',
    '  background: rgba(128, 128, 128, 0.08); color: inherit; font-size: 13px; outline: none;',
    '}',
    '.agy-ai-input:focus, .agy-ai-select:focus { border-color: #38bdf8; }',
    '.agy-ai-btn {',
    '  height: 38px; padding: 0 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600;',
    '  cursor: pointer; border: 1px solid var(--border, rgba(148, 163, 184, 0.28));',
    '  background: rgba(128, 128, 128, 0.12); color: inherit;',
    '  display: inline-flex; align-items: center; justify-content: center; gap: 6px;',
    '  transition: all 0.15s ease; white-space: nowrap;',
    '}',
    '.agy-ai-btn:hover { background: rgba(128, 128, 128, 0.22); }',
    '.agy-ai-btn-primary {',
    '  background: #0284c7; color: #ffffff; border-color: #0284c7;',
    '}',
    '.agy-ai-btn-primary:hover { background: #0369a1; }',
    '.agy-ai-btn-sm { height: 30px; padding: 0 10px; font-size: 11.5px; border-radius: 6px; }',
    '.agy-ai-models-list {',
    '  display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto;',
    '}',
    '.agy-ai-model-item {',
    '  display: flex; align-items: center; justify-content: space-between; gap: 8px;',
    '  padding: 8px 10px; border-radius: 8px;',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.16));',
    '  background: rgba(128, 128, 128, 0.04);',
    '}',
    '.agy-ai-model-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }',
    '.agy-ai-model-info { min-width: 0; flex: 1; }',
    '.agy-ai-model-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.agy-ai-model-id { font-size: 11px; opacity: 0.65; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.agy-ai-tag {',
    '  font-size: 10.5px; padding: 2px 7px; border-radius: 999px; font-weight: 600;',
    '  cursor: pointer; user-select: none; border: 1px solid rgba(56, 189, 248, 0.35);',
    '  background: rgba(56, 189, 248, 0.12); color: #38bdf8;',
    '}',
    'html.light .agy-ai-tag { color: #0284c7; border-color: rgba(2, 132, 199, 0.35); }',
    '.agy-ai-tag.off { opacity: 0.45; border-color: rgba(148, 163, 184, 0.3); background: transparent; color: inherit; }',
    '.agy-ai-status { font-size: 12px; padding: 8px 10px; border-radius: 8px; display: none; }',
    '.agy-ai-status.ok { display: block; background: rgba(34, 197, 94, 0.14); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }',
    'html.light .agy-ai-status.ok { color: #15803d; }',
    '.agy-ai-status.err { display: block; background: rgba(239, 68, 68, 0.14); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }',
    'html.light .agy-ai-status.err { color: #b91c1c; }',
    '.agy-ai-inline-card {',
    '  width: 100%; box-sizing: border-box;',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.24));',
    '  border-radius: 12px; padding: 14px 16px;',
    '  background: rgba(56, 189, 248, 0.06);',
    '  display: flex; flex-direction: column; gap: 12px;',
    '}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);
}

/**
 * patches/ai_models_menu/modal.js - Interactive AI Models & API Key Manager Modal (English UI).
 */

var activeModalEl = null;

function closeAiModelsModal() {
  if (activeModalEl && activeModalEl.parentNode) {
    activeModalEl.parentNode.removeChild(activeModalEl);
  }
  activeModalEl = null;
}

function openAiModelsModal(initialProvider) {
  ensureStyles();
  closeAiModelsModal();

  var cfg = loadAiConfig();
  if (initialProvider && PROVIDER_META[initialProvider]) {
    cfg.activeProvider = initialProvider;
  }
  var selectedProv = cfg.activeProvider || 'gemini';
  if (!PROVIDER_META[selectedProv]) {
    selectedProv = 'gemini';
  }
  var showKey = false;
  var statusMsg = '';
  var statusType = '';
  var isSaving = false;
  var isFetching = false;

  var backdrop = document.createElement('div');
  backdrop.className = 'agy-ai-backdrop';
  backdrop.addEventListener('click', function (ev) {
    if (ev.target === backdrop && !isSaving) {
      closeAiModelsModal();
    }
  });

  var modal = document.createElement('div');
  modal.className = 'agy-ai-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'AI Models & API Keys');
  backdrop.appendChild(modal);
  activeModalEl = backdrop;

  function setStatus(type, msg) {
    statusType = type;
    statusMsg = msg;
    render();
  }

  function countProvidersWithKeys() {
    var count = 0;
    Object.keys(cfg.providers || {}).forEach(function (pid) {
      var p = cfg.providers[pid];
      if (p && p.apiKey && p.apiKey.trim()) count++;
    });
    return count;
  }

  function render() {
    modal.innerHTML = '';

    var dragPill = document.createElement('div');
    dragPill.className = 'agy-ai-drag-pill';
    modal.appendChild(dragPill);

    // 1. Header
    var header = document.createElement('div');
    header.className = 'agy-ai-header';
    var titleWrap = document.createElement('div');
    var h2 = document.createElement('h2');
    h2.className = 'agy-ai-title';
    h2.textContent = 'AI Models & API Keys (Multi-Provider)';
    var sub = document.createElement('div');
    sub.className = 'agy-ai-subtitle';
    sub.textContent = 'Use Gemini, OpenAI, Claude, OpenRouter, DeepSeek, Groq, xAI, or a Custom Endpoint';
    titleWrap.appendChild(h2);
    titleWrap.appendChild(sub);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'agy-ai-btn agy-ai-btn-sm';
    closeBtn.textContent = '✕';
    closeBtn.disabled = isSaving;
    closeBtn.addEventListener('click', closeAiModelsModal);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // 2. Body
    var body = document.createElement('div');
    body.className = 'agy-ai-body';

    // Mode Selector Bar
    var modeBar = document.createElement('div');
    modeBar.className = 'agy-ai-mode-bar';

    var btnDefault = document.createElement('button');
    btnDefault.type = 'button';
    btnDefault.className = 'agy-ai-mode-btn' + (!cfg.enabled ? ' active' : '');
    btnDefault.textContent = 'Default Google Account (OAuth)';
    btnDefault.addEventListener('click', function () {
      cfg.enabled = false;
      statusMsg = '';
      render();
    });

    var btnCustom = document.createElement('button');
    btnCustom.type = 'button';
    btnCustom.className = 'agy-ai-mode-btn' + (cfg.enabled ? ' active' : '');
    btnCustom.textContent = 'Use Custom API Key (BYOK)';
    btnCustom.addEventListener('click', function () {
      cfg.enabled = true;
      statusMsg = '';
      render();
    });

    modeBar.appendChild(btnDefault);
    modeBar.appendChild(btnCustom);
    body.appendChild(modeBar);

    if (!cfg.enabled) {
      var infoSec = document.createElement('div');
      infoSec.className = 'agy-ai-section';
      var infoText = document.createElement('div');
      infoText.className = 'agy-ai-hint';
      infoText.style.fontSize = '12.5px';
      infoText.innerHTML = '<b>Default Google Account (OAuth)</b> mode is currently active.<br><br>'
        + 'Switch to the <b>"Use Custom API Key (BYOK)"</b> tab above to use your own API keys with Gemini, OpenAI, Anthropic Claude, OpenRouter, DeepSeek, Groq, Grok, Mistral, or a local/custom endpoint ('
        + countProvidersWithKeys() + ' saved API key(s)).';
      infoSec.appendChild(infoText);
      body.appendChild(infoSec);
    } else {
      // Provider Grid
      var provSec = document.createElement('div');
      var provLabel = document.createElement('label');
      provLabel.className = 'agy-ai-label';
      provLabel.textContent = '1. Select AI Provider';
      provSec.appendChild(provLabel);

      var provGrid = document.createElement('div');
      provGrid.className = 'agy-ai-providers-grid';

      PROVIDER_ORDER.forEach(function (pid) {
        var meta = PROVIDER_META[pid];
        var pData = cfg.providers[pid];
        var hasKey = pid === 'multi'
          ? countProvidersWithKeys() > 0
          : Boolean(pData && pData.apiKey && pData.apiKey.trim());

        var pBtn = document.createElement('button');
        pBtn.type = 'button';
        pBtn.className = 'agy-ai-prov-btn' + (selectedProv === pid ? ' active' : '');
        pBtn.addEventListener('click', function () {
          selectedProv = pid;
          cfg.activeProvider = pid;
          statusMsg = '';
          render();
        });

        var topRow = document.createElement('div');
        topRow.className = 'agy-ai-prov-name';
        var nameSpan = document.createElement('span');
        nameSpan.textContent = meta.shortName;
        topRow.appendChild(nameSpan);
        if (hasKey) {
          var dot = document.createElement('span');
          dot.className = 'agy-ai-dot';
          dot.title = 'API key saved';
          topRow.appendChild(dot);
        }

        var badgeSpan = document.createElement('div');
        badgeSpan.className = 'agy-ai-prov-badge';
        badgeSpan.textContent = meta.badge;

        pBtn.appendChild(topRow);
        pBtn.appendChild(badgeSpan);
        provGrid.appendChild(pBtn);
      });

      provSec.appendChild(provGrid);
      body.appendChild(provSec);

      var curMeta = PROVIDER_META[selectedProv] || PROVIDER_META.gemini;
      var curProv = cfg.providers[selectedProv];

      if (selectedProv === 'multi') {
        // Multi-provider overview
        var multiSec = document.createElement('div');
        multiSec.className = 'agy-ai-section';
        var multiTitle = document.createElement('div');
        multiTitle.className = 'agy-ai-label';
        multiTitle.textContent = 'Multi-Provider Mode (Combine All Configured API Keys)';
        var multiHint = document.createElement('div');
        multiHint.className = 'agy-ai-hint';
        multiHint.textContent = curMeta.helpText;
        multiSec.appendChild(multiTitle);
        multiSec.appendChild(multiHint);

        var multiList = document.createElement('div');
        multiList.className = 'agy-ai-models-list';
        var totalModels = 0;
        PROVIDER_ORDER.forEach(function (pid) {
          if (pid === 'multi') return;
          var p = cfg.providers[pid];
          if (!p) return;
          var hasKey = Boolean(p.apiKey && p.apiKey.trim());
          if (!hasKey && pid !== 'custom') return;
          var enabledModels = (p.models || []).filter(function (m) { return m && m.enabled !== false; });
          totalModels += enabledModels.length;

          var row = document.createElement('div');
          row.className = 'agy-ai-model-item';
          row.innerHTML = '<div class="agy-ai-model-left"><span class="agy-ai-dot"></span><div class="agy-ai-model-info">'
            + '<div class="agy-ai-model-name">' + escapeHtml(p.name || pid) + '</div>'
            + '<div class="agy-ai-model-id">' + enabledModels.length + ' active model(s)</div>'
            + '</div></div>';
          var editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'agy-ai-btn agy-ai-btn-sm';
          editBtn.textContent = 'Configure';
          editBtn.addEventListener('click', function () {
            selectedProv = pid;
            render();
          });
          row.appendChild(editBtn);
          multiList.appendChild(row);
        });

        if (totalModels === 0) {
          var emptyHint = document.createElement('div');
          emptyHint.className = 'agy-ai-hint';
          emptyHint.style.color = '#f87171';
          emptyHint.textContent = 'No providers have an API key configured yet. Select a provider above (e.g. Gemini, OpenRouter, OpenAI, Claude, DeepSeek, Groq) and enter an API key first.';
          multiSec.appendChild(emptyHint);
        } else {
          multiSec.appendChild(multiList);
        }
        body.appendChild(multiSec);
      } else if (curProv) {
        // 2. API Key & Endpoint Section
        var keySec = document.createElement('div');
        keySec.className = 'agy-ai-section';

        var keyLabel = document.createElement('label');
        keyLabel.className = 'agy-ai-label';
        keyLabel.textContent = '2. API Key & Endpoint — ' + (curProv.name || curMeta.shortName);
        keySec.appendChild(keyLabel);

        var keyHint = document.createElement('div');
        keyHint.className = 'agy-ai-hint';
        keyHint.textContent = curMeta.helpText;
        keySec.appendChild(keyHint);

        var keyRow = document.createElement('div');
        keyRow.className = 'agy-ai-row';

        var keyInput = document.createElement('input');
        keyInput.type = showKey ? 'text' : 'password';
        keyInput.className = 'agy-ai-input';
        keyInput.placeholder = curMeta.placeholderKey || 'Enter API Key...';
        keyInput.value = curProv.apiKey || '';
        keyInput.autocomplete = 'off';
        keyInput.spellcheck = false;
        keyInput.addEventListener('input', function (e) {
          curProv.apiKey = e.target.value;
        });

        var toggleShowBtn = document.createElement('button');
        toggleShowBtn.type = 'button';
        toggleShowBtn.className = 'agy-ai-btn';
        toggleShowBtn.textContent = showKey ? 'Hide' : 'Show';
        toggleShowBtn.addEventListener('click', function () {
          showKey = !showKey;
          render();
        });

        keyRow.appendChild(keyInput);
        keyRow.appendChild(toggleShowBtn);
        keySec.appendChild(keyRow);

        // Endpoint URL & Wire Protocol row
        var urlRow = document.createElement('div');
        urlRow.className = 'agy-ai-row';

        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'agy-ai-input';
        urlInput.placeholder = 'Base URL (https://...)';
        urlInput.value = curProv.baseUrl || '';
        urlInput.addEventListener('input', function (e) {
          curProv.baseUrl = e.target.value;
        });

        var protoSelect = document.createElement('select');
        protoSelect.className = 'agy-ai-select';
        protoSelect.style.maxWidth = '165px';
        var optOpenAi = document.createElement('option');
        optOpenAi.value = 'openai';
        optOpenAi.textContent = 'Protocol: OpenAI';
        var optGenAi = document.createElement('option');
        optGenAi.value = 'genai';
        optGenAi.textContent = 'Protocol: Gemini';
        protoSelect.appendChild(optOpenAi);
        protoSelect.appendChild(optGenAi);
        protoSelect.value = curProv.wireProtocol === 'genai' ? 'genai' : 'openai';
        protoSelect.addEventListener('change', function (e) {
          curProv.wireProtocol = e.target.value;
        });

        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'agy-ai-btn';
        testBtn.disabled = isFetching;
        testBtn.textContent = isFetching ? 'Testing...' : 'Test Key & Fetch Models';
        testBtn.addEventListener('click', function () {
          if (isFetching) return;
          isFetching = true;
          setStatus('', '');
          fetchProviderModelsFromBridge(
            selectedProv,
            curProv.baseUrl,
            curProv.apiKey,
            curProv.wireProtocol
          ).then(function (res) {
            isFetching = false;
            if (res && res.ok && Array.isArray(res.models)) {
              var existingMap = {};
              (curProv.models || []).forEach(function (m) {
                if (m && m.modelId) existingMap[m.modelId] = m;
              });
              var added = 0;
              res.models.forEach(function (m) {
                if (!m || !m.modelId) return;
                if (!existingMap[m.modelId]) {
                  curProv.models.push(m);
                  existingMap[m.modelId] = m;
                  added++;
                }
              });
              setStatus('ok', 'API Key verified! Found ' + res.models.length + ' model(s) (' + added + ' new added).');
            } else {
              setStatus('err', 'Failed to fetch models: ' + (res && res.error ? res.error : 'Please verify your API Key and Base URL'));
            }
          });
        });

        urlRow.appendChild(urlInput);
        urlRow.appendChild(protoSelect);
        urlRow.appendChild(testBtn);
        keySec.appendChild(urlRow);
        body.appendChild(keySec);

        // 3. Models Catalog Section
        var modSec = document.createElement('div');
        modSec.className = 'agy-ai-section';

        var modHeaderRow = document.createElement('div');
        modHeaderRow.className = 'agy-ai-row';
        modHeaderRow.style.justifyContent = 'space-between';

        var modLabel = document.createElement('label');
        modLabel.className = 'agy-ai-label';
        modLabel.style.margin = '0';
        var activeCount = (curProv.models || []).filter(function (m) { return m && m.enabled !== false; }).length;
        modLabel.textContent = '3. AI Models (' + activeCount + ' enabled)';

        var resetDefaultBtn = document.createElement('button');
        resetDefaultBtn.type = 'button';
        resetDefaultBtn.className = 'agy-ai-btn agy-ai-btn-sm';
        resetDefaultBtn.textContent = 'Reset Defaults';
        resetDefaultBtn.addEventListener('click', function () {
          var defs = getDefaultConfig();
          if (defs.providers[selectedProv]) {
            curProv.models = defs.providers[selectedProv].models;
            curProv.baseUrl = defs.providers[selectedProv].baseUrl;
            curProv.wireProtocol = defs.providers[selectedProv].wireProtocol;
            render();
          }
        });

        modHeaderRow.appendChild(modLabel);
        modHeaderRow.appendChild(resetDefaultBtn);
        modSec.appendChild(modHeaderRow);

        var modList = document.createElement('div');
        modList.className = 'agy-ai-models-list';

        (curProv.models || []).forEach(function (m, idx) {
          if (!m) return;
          var item = document.createElement('div');
          item.className = 'agy-ai-model-item';

          var left = document.createElement('div');
          left.className = 'agy-ai-model-left';

          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = m.enabled !== false;
          cb.addEventListener('change', function (e) {
            m.enabled = e.target.checked;
            render();
          });

          var info = document.createElement('div');
          info.className = 'agy-ai-model-info';
          var mName = document.createElement('div');
          mName.className = 'agy-ai-model-name';
          mName.textContent = m.displayName || m.modelId;
          var mId = document.createElement('div');
          mId.className = 'agy-ai-model-id';
          mId.textContent = m.modelId;
          info.appendChild(mName);
          info.appendChild(mId);

          left.appendChild(cb);
          left.appendChild(info);

          var right = document.createElement('div');
          right.className = 'agy-ai-row';
          right.style.flexWrap = 'nowrap';
          right.style.width = 'auto';

          var thinkTag = document.createElement('span');
          thinkTag.className = 'agy-ai-tag' + (m.supportsThinking ? '' : ' off');
          thinkTag.textContent = m.supportsThinking ? 'Thinking: ON' : 'Thinking: OFF';
          thinkTag.title = 'Click to toggle Thinking/Reasoning support for this model';
          thinkTag.addEventListener('click', function () {
            m.supportsThinking = !m.supportsThinking;
            render();
          });

          var delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'agy-ai-btn agy-ai-btn-sm';
          delBtn.textContent = 'Remove';
          delBtn.addEventListener('click', function () {
            curProv.models.splice(idx, 1);
            render();
          });

          right.appendChild(thinkTag);
          right.appendChild(delBtn);

          item.appendChild(left);
          item.appendChild(right);
          modList.appendChild(item);
        });

        modSec.appendChild(modList);

        // Add Custom Model Form
        var addRow = document.createElement('div');
        addRow.className = 'agy-ai-row';
        addRow.style.marginTop = '4px';

        var newIdInput = document.createElement('input');
        newIdInput.type = 'text';
        newIdInput.className = 'agy-ai-input';
        newIdInput.placeholder = 'New Model ID (e.g. gpt-4.1-nano / gemini-2.5-pro)';

        var newNameInput = document.createElement('input');
        newNameInput.type = 'text';
        newNameInput.className = 'agy-ai-input';
        newNameInput.placeholder = 'Display Name (optional)';

        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'agy-ai-btn';
        addBtn.textContent = '+ Add Model';
        addBtn.addEventListener('click', function () {
          var idVal = (newIdInput.value || '').trim();
          if (!idVal) {
            setStatus('err', 'Please enter a Model ID first.');
            return;
          }
          var nameVal = (newNameInput.value || '').trim() || idVal;
          var isThink = idVal.indexOf('2.5') !== -1 || idVal.indexOf('o1') !== -1
            || idVal.indexOf('o3') !== -1 || idVal.indexOf('o4') !== -1
            || idVal.indexOf('reasoner') !== -1 || idVal.indexOf('r1') !== -1
            || idVal.indexOf('thinking') !== -1 || idVal.indexOf('claude-3-7') !== -1
            || idVal.indexOf('claude-sonnet-4') !== -1 || idVal.indexOf('claude-opus-4') !== -1;
          curProv.models = curProv.models || [];
          curProv.models.unshift({
            modelId: idVal,
            displayName: nameVal,
            supportsThinking: isThink,
            enabled: true,
            maxTokens: 128000,
            maxOutputTokens: 16384
          });
          setStatus('ok', 'Model "' + nameVal + '" added to list.');
        });

        addRow.appendChild(newIdInput);
        addRow.appendChild(newNameInput);
        addRow.appendChild(addBtn);
        modSec.appendChild(addRow);

        body.appendChild(modSec);
      }
    }

    // Status Banner
    if (statusMsg) {
      var st = document.createElement('div');
      st.className = 'agy-ai-status ' + (statusType === 'err' ? 'err' : 'ok');
      st.textContent = statusMsg;
      body.appendChild(st);
    }

    modal.appendChild(body);

    // 3. Footer
    var footer = document.createElement('div');
    footer.className = 'agy-ai-footer';

    var footerHint = document.createElement('div');
    footerHint.className = 'agy-ai-hint';
    footerHint.textContent = isSaving
      ? 'Saving & restarting Core Engine...'
      : (cfg.enabled
          ? 'Active: ' + (PROVIDER_META[selectedProv] ? PROVIDER_META[selectedProv].shortName : selectedProv)
          : 'Mode: Default Google Account');

    var footerBtns = document.createElement('div');
    footerBtns.className = 'agy-ai-row';
    footerBtns.style.width = 'auto';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'agy-ai-btn';
    cancelBtn.disabled = isSaving;
    cancelBtn.textContent = 'Close';
    cancelBtn.addEventListener('click', closeAiModelsModal);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'agy-ai-btn agy-ai-btn-primary';
    saveBtn.disabled = isSaving;
    saveBtn.textContent = isSaving ? 'Applying...' : 'Save & Apply';
    saveBtn.addEventListener('click', function () {
      if (isSaving) return;
      cfg.activeProvider = selectedProv;
      if (cfg.enabled && selectedProv !== 'multi' && selectedProv !== 'custom') {
        var p = cfg.providers[selectedProv];
        if (!p || !p.apiKey || !p.apiKey.trim()) {
          setStatus('err', 'Please enter an API Key for ' + (p ? p.name : selectedProv) + ' first.');
          return;
        }
      }
      if (cfg.enabled && selectedProv === 'multi' && countProvidersWithKeys() === 0) {
        setStatus('err', 'Configure at least 1 provider API Key before enabling Multi-Provider mode.');
        return;
      }

      isSaving = true;
      setStatus('ok', 'Saving API Key configuration & reloading AI models...');
      var ok = saveAiConfigToBridge(cfg);
      if (!ok) {
        isSaving = false;
        setStatus('err', 'Failed to save configuration to Android Bridge.');
        return;
      }
      waitForCoreRestart(12000).then(function () {
        window.location.reload();
      });
    });

    footerBtns.appendChild(cancelBtn);
    footerBtns.appendChild(saveBtn);
    footer.appendChild(footerHint);
    footer.appendChild(footerBtns);
    modal.appendChild(footer);
  }

  render();
  document.body.appendChild(backdrop);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * patches/ai_models_menu/inject.js - Injects inline cards & quick access buttons into Settings and Login prompts.
 */

var CARD_MARKER = 'data-agy-ai-models-card';
var LOGIN_BTN_MARKER = 'data-agy-ai-login-btn';

function getActiveSummaryText() {
  var cfg = loadAiConfig();
  if (!cfg.enabled) {
    return 'Mode: Default Google Account (OAuth) — Click to use your own API Key (Gemini, OpenAI, Claude, OpenRouter, DeepSeek, Groq, etc.)';
  }
  var pid = cfg.activeProvider || 'gemini';
  var meta = PROVIDER_META[pid] || PROVIDER_META.gemini;
  if (pid === 'multi') {
    return 'Active Mode: Multi-Provider (Combined API Keys)';
  }
  var prov = cfg.providers && cfg.providers[pid];
  var count = prov && Array.isArray(prov.models)
    ? prov.models.filter(function (m) { return m && m.enabled !== false; }).length
    : 0;
  return 'Active Mode: ' + meta.shortName + ' (' + count + ' AI model(s) enabled)';
}

function createInlineSettingsCard() {
  ensureStyles();
  var card = document.createElement('div');
  card.className = 'agy-ai-inline-card';
  card.setAttribute(CARD_MARKER, '1');

  var top = document.createElement('div');
  top.className = 'agy-ai-row';
  top.style.justifyContent = 'space-between';

  var info = document.createElement('div');
  info.style.flex = '1';
  info.style.minWidth = '180px';

  var title = document.createElement('div');
  title.style.fontSize = '14px';
  title.style.fontWeight = '600';
  title.textContent = 'AI Models & API Keys (Multi-Provider BYOK)';

  var desc = document.createElement('div');
  desc.className = 'agy-ai-hint';
  desc.style.marginTop = '3px';
  desc.textContent = getActiveSummaryText();

  info.appendChild(title);
  info.appendChild(desc);

  var openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'agy-ai-btn agy-ai-btn-primary';
  openBtn.textContent = 'Manage API Keys & Models';
  openBtn.addEventListener('click', function () {
    openAiModelsModal();
  });

  top.appendChild(info);
  top.appendChild(openBtn);
  card.appendChild(top);
  return card;
}

function findSettingsContentColumn(el) {
  var cur = el;
  while (cur && cur !== document.body) {
    var cls = typeof cur.className === 'string' ? cur.className : '';
    if (cls.indexOf('flex-col') !== -1 && (cls.indexOf('gap-8') !== -1 || cls.indexOf('max-w-2xl') !== -1)) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function scanAndInjectAiMenu() {
  try {
    // 1. Inject inline card cleanly into the Settings page vertical stack ("Models & Usage" or "Account")
    var descriptions = document.querySelectorAll('div, p, span');
    for (var i = 0; i < descriptions.length; i++) {
      var el = descriptions[i];
      if (el.children.length > 0) continue;
      var text = (el.textContent || '').trim();
      if (text === 'Manage your model quota and credits.' ||
          text === 'Manage your plan, credentials, and general preferences.') {
        var pageCol = findSettingsContentColumn(el);
        if (pageCol) {
          // Look for the inner sections container (.flex.flex-col.gap-8.w-full) or use pageCol
          var sectionsStack = pageCol.querySelector('.gap-8') || pageCol;
          if (!pageCol.querySelector('[' + CARD_MARKER + ']')) {
            var card = createInlineSettingsCard();
            if (sectionsStack.firstChild) {
              sectionsStack.insertBefore(card, sectionsStack.firstChild);
            } else {
              sectionsStack.appendChild(card);
            }
          }
        }
      }
    }

    // 2. Inject "Use API Key" button next to "To use the agent, please login here" or "Sign In" buttons
    var buttons = document.querySelectorAll('button, a');
    for (var j = 0; j < buttons.length; j++) {
      var btn = buttons[j];
      var txt = (btn.textContent || '').trim();
      if ((txt === 'Sign In' || txt === 'here' || txt === 'Sign in with Google') && btn.parentElement) {
        if (!btn.parentElement.querySelector('[' + LOGIN_BTN_MARKER + ']')) {
          ensureStyles();
          var apiBtn = document.createElement('button');
          apiBtn.type = 'button';
          apiBtn.setAttribute(LOGIN_BTN_MARKER, '1');
          apiBtn.className = 'agy-ai-btn agy-ai-btn-sm';
          apiBtn.style.marginLeft = '8px';
          apiBtn.textContent = 'Use API Key';
          apiBtn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            openAiModelsModal();
          });
          btn.parentElement.appendChild(apiBtn);
        }
      }
    }
  } catch (_) {}
}

function installAiModelsMenu() {
  var scheduled = false;
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      scanAndInjectAiMenu();
    });
  });

  function start() {
    if (!document.body) return;
    scanAndInjectAiMenu();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

installAiModelsMenu();

/**
 * patches/ai_models_menu/mcp_plugins_fallback.js
 * Provides a built-in MCP Server Store catalog and Build With Google Plugins
 * fallback when running in Custom AI Key / Gateway mode (where language_server's
 * CodeAssistClient is inactive and returns empty or "Plugins not supported for this auth method").
 */

var FALLBACK_MCP_SERVERS = [
  {
    id: 'context7',
    title: 'Context7',
    description: 'Up-to-date code documentation and API references for any library or framework.',
    link: 'https://context7.com',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@upstash/context7-mcp']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'filesystem',
    title: 'Filesystem',
    description: 'Secure file operations with configurable directory access controls.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '${ALLOWED_DIR}']
            },
            variables: [
              { name: 'ALLOWED_DIR', description: 'Allowed directory path (e.g. /storage/emulated/0/Documents)', defaultValue: '/storage/emulated/0/Documents', required: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'sequential-thinking',
    title: 'Sequential Thinking',
    description: 'Dynamic and reflective problem-solving through structured thought sequences.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'memory',
    title: 'Memory (Knowledge Graph)',
    description: 'Persistent memory using a local knowledge graph across conversations.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-memory']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'github',
    title: 'GitHub',
    description: 'Repository management, file operations, issues, pull requests, and code search.',
    link: 'https://github.com/github/github-mcp-server',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
              env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' }
            },
            variables: [
              { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', description: 'GitHub Personal Access Token', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'fetch',
    title: 'Fetch',
    description: 'Web content fetching and conversion to markdown for efficient LLM usage.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          uvx: {
            template: {
              command: 'uvx',
              args: ['mcp-server-fetch']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'playwright',
    title: 'Playwright',
    description: 'Browser automation and web scraping using Playwright accessibility snapshots.',
    link: 'https://github.com/microsoft/playwright-mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@playwright/mcp@latest']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'sqlite',
    title: 'SQLite',
    description: 'Database interaction, schema inspection, and business intelligence on SQLite files.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          uvx: {
            template: {
              command: 'uvx',
              args: ['mcp-server-sqlite', '--db-path', '${DB_PATH}']
            },
            variables: [
              { name: 'DB_PATH', description: 'Path to SQLite database file', required: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'postgres',
    title: 'PostgreSQL',
    description: 'Read-only database access with schema inspection and SQL query execution.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-postgres', '${POSTGRES_URL}']
            },
            variables: [
              { name: 'POSTGRES_URL', description: 'PostgreSQL connection string (postgresql://...)', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'firebase',
    title: 'Firebase',
    description: 'Manage Firebase projects, Firestore, Auth, Hosting, and Cloud Functions.',
    link: 'https://firebase.google.com/docs/cli/mcp-server',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', 'firebase-tools@latest', 'experimental:mcp']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'supabase',
    title: 'Supabase',
    description: 'Connect to Supabase projects for database queries, migrations, and Edge Functions.',
    link: 'https://supabase.com/docs/guides/getting-started/mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', '${SUPABASE_ACCESS_TOKEN}']
            },
            variables: [
              { name: 'SUPABASE_ACCESS_TOKEN', description: 'Supabase Personal Access Token', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'brave-search',
    title: 'Brave Search',
    description: 'Web and local search using the Brave Search API.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-brave-search'],
              env: { BRAVE_API_KEY: '${BRAVE_API_KEY}' }
            },
            variables: [
              { name: 'BRAVE_API_KEY', description: 'Brave Search API Key', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'notion',
    title: 'Notion',
    description: 'Search, read, and update Notion pages and databases.',
    link: 'https://developers.notion.com/docs/mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'remote',
      value: {
        template: {
          serverUrl: 'https://mcp.notion.com/mcp'
        }
      }
    }
  },
  {
    id: 'linear',
    title: 'Linear',
    description: 'Create, search, and manage Linear issues, projects, and cycles.',
    link: 'https://linear.app/docs/mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'remote',
      value: {
        template: {
          serverUrl: 'https://mcp.linear.app/mcp'
        }
      }
    }
  }
];

var FALLBACK_BWG_PLUGINS = [
  {
    plugin: {
      uid: 'gemini-api-dev',
      name: 'Gemini API & AI Studio',
      description: 'Best practices, SDK references, and structured output guides for Google Gemini APIs.'
    }
  },
  {
    plugin: {
      uid: 'android-developer',
      name: 'Android & Jetpack Compose',
      description: 'Android architecture, Gradle, Jetpack Compose, and ADB/Shizuku development skills.'
    }
  },
  {
    plugin: {
      uid: 'firebase-developer',
      name: 'Firebase Developer',
      description: 'Skills and guidelines for Firestore, Firebase Auth, Cloud Functions, and Hosting.'
    }
  },
  {
    plugin: {
      uid: 'google-cloud-run',
      name: 'Google Cloud Run',
      description: 'Containerize, deploy, and troubleshoot services on Google Cloud Run.'
    }
  },
  {
    plugin: {
      uid: 'flutter-developer',
      name: 'Flutter Developer',
      description: 'Cross-platform mobile UI and state management best practices for Flutter.'
    }
  }
];

window.__agMcpPluginsFallback = {
  getAvailableCascadePlugins: function (req) {
    var q = (req && req.searchQuery ? String(req.searchQuery) : '').trim().toLowerCase();
    var filtered = !q
      ? FALLBACK_MCP_SERVERS
      : FALLBACK_MCP_SERVERS.filter(function (item) {
          return (
            item.title.toLowerCase().indexOf(q) !== -1 ||
            item.id.toLowerCase().indexOf(q) !== -1 ||
            item.description.toLowerCase().indexOf(q) !== -1
          );
        });
    return { plugins: filtered };
  },
  getBuildWithGooglePlugins: function () {
    return { plugins: FALLBACK_BWG_PLUGINS };
  },
  installPluginLocally: function (uid) {
    var match = null;
    for (var i = 0; i < FALLBACK_BWG_PLUGINS.length; i++) {
      if (FALLBACK_BWG_PLUGINS[i].plugin.uid === uid) {
        match = FALLBACK_BWG_PLUGINS[i].plugin;
        break;
      }
    }
    var name = match ? match.name : uid;
    var desc = match ? match.description : '';
    if (window.Android && typeof window.Android.installLocalPlugin === 'function') {
      var resStr = window.Android.installLocalPlugin(getBridgeToken(), uid, name, desc);
      var res = JSON.parse(resStr || '{}');
      if (!res.ok) {
        throw new Error(res.error || 'Failed to install local plugin');
      }
      return {};
    }
    throw new Error('Android local plugin bridge unavailable');
  },
  removePluginLocally: function (uid) {
    if (window.Android && typeof window.Android.removeLocalPlugin === 'function') {
      var resStr = window.Android.removeLocalPlugin(getBridgeToken(), uid);
      var res = JSON.parse(resStr || '{}');
      if (!res.ok) {
        throw new Error(res.error || 'Failed to remove local plugin');
      }
      return {};
    }
    throw new Error('Android local plugin bridge unavailable');
  }
};

/**
 * patches/ai_models_menu/public-api.js - Public API for opening the AI Models & API Key menu.
 */

window.__agAiModels = {
  __installed: true,
  openModal: openAiModelsModal,
  closeModal: closeAiModelsModal,
  getConfig: loadAiConfig,
  saveConfig: saveAiConfigToBridge
};

window.__agOpenAiModelsModal = openAiModelsModal;


})();
