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
