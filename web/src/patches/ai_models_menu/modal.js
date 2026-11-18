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
  var showCustomHeaders = false;
  var modelFilterQuery = '';
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

  function isKeylessAllowed(pid) {
    return pid === 'custom' || pid === 'custom_anthropic';
  }

  function hasCustomHeadersConfigured(p) {
    return Boolean(p && p.customHeaders && typeof p.customHeaders === 'object' && Object.keys(p.customHeaders).length > 0);
  }

  function formatCustomHeadersText(headersObj) {
    if (!headersObj || typeof headersObj !== 'object') return '';
    return Object.keys(headersObj).map(function (k) {
      return k + ': ' + headersObj[k];
    }).join('\n');
  }

  function parseCustomHeadersText(rawText) {
    var trimmed = String(rawText || '').trim();
    if (!trimmed) return {};
    if (trimmed.charAt(0) === '{') {
      try {
        var parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          var clean = {};
          Object.keys(parsed).forEach(function (k) {
            if (k && parsed[k] !== undefined && parsed[k] !== null) {
              clean[String(k).trim()] = String(parsed[k]).trim();
            }
          });
          return clean;
        }
      } catch (_) {}
    }
    var out = {};
    trimmed.split(/\r?\n/).forEach(function (line) {
      var idx = line.indexOf(':');
      if (idx > 0) {
        var k = line.slice(0, idx).trim();
        var v = line.slice(idx + 1).trim();
        if (k && v) out[k] = v;
      }
    });
    return out;
  }

  function formatTokenCount(tokens) {
    var n = Number(tokens || 0);
    if (!n || n <= 0) return '';
    if (n >= 1000000) return (n / 1048576 >= 1 ? Math.round(n / 1048576) : (n / 1000000).toFixed(1)) + 'M ctx';
    if (n >= 1000) return Math.round(n / 1000) + 'K ctx';
    return n + ' ctx';
  }

  function countProvidersWithKeys() {
    var count = 0;
    Object.keys(cfg.providers || {}).forEach(function (pid) {
      var p = cfg.providers[pid];
      if (!p) return;
      if ((p.apiKey && p.apiKey.trim()) || hasCustomHeadersConfigured(p)) {
        count++;
      }
    });
    return count;
  }

  function render() {
    var prevBodyEl = modal.querySelector('.agy-ai-body');
    var prevListEl = modal.querySelector('.agy-ai-models-list');
    var prevBodyScroll = prevBodyEl ? prevBodyEl.scrollTop : 0;
    var prevListScroll = prevListEl ? prevListEl.scrollTop : 0;

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
    sub.textContent = 'Use Gemini, OpenAI, Claude, Custom Anthropic (/v1/messages), OpenRouter, DeepSeek, Groq, or Local LLMs';
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
        + 'Switch to the <b>"Use Custom API Key (BYOK)"</b> tab above to use your own API keys with Gemini, OpenAI, Anthropic Claude, Custom Anthropic (/v1/messages), OpenRouter, DeepSeek, Groq, Grok, Mistral, or a local/custom endpoint ('
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
          : Boolean(pData && ((pData.apiKey && pData.apiKey.trim()) || hasCustomHeadersConfigured(pData)));

        var pBtn = document.createElement('button');
        pBtn.type = 'button';
        pBtn.className = 'agy-ai-prov-btn' + (selectedProv === pid ? ' active' : '');
        pBtn.addEventListener('click', function () {
          selectedProv = pid;
          cfg.activeProvider = pid;
          modelFilterQuery = '';
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
          dot.title = 'API key configured';
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
          var hasKey = Boolean((p.apiKey && p.apiKey.trim()) || hasCustomHeadersConfigured(p));
          if (!hasKey && !isKeylessAllowed(pid)) return;
          var enabledModels = (p.models || []).filter(function (m) { return m && m.enabled !== false; });
          totalModels += enabledModels.length;

          var protoBadge = p.wireProtocol === 'anthropic'
            ? 'Anthropic /v1/messages'
            : (p.wireProtocol === 'genai' ? 'Gemini /v1beta' : 'OpenAI /v1/chat');

          var row = document.createElement('div');
          row.className = 'agy-ai-model-item';
          row.innerHTML = '<div class="agy-ai-model-left"><span class="agy-ai-dot"></span><div class="agy-ai-model-info">'
            + '<div class="agy-ai-model-name">' + escapeHtml(p.name || pid) + '</div>'
            + '<div class="agy-ai-model-id">' + enabledModels.length + ' active model(s) • ' + escapeHtml(protoBadge) + '</div>'
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
          emptyHint.textContent = 'No providers have an API key configured yet. Select a provider above (e.g. Gemini, OpenRouter, OpenAI, Claude, Custom Anthropic, DeepSeek, Groq) and enter an API key first.';
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

        // Quick Endpoint Presets (for anthropic, custom_anthropic, custom)
        var presets = ENDPOINT_PRESETS[selectedProv];
        if (Array.isArray(presets) && presets.length > 0) {
          var presetsRow = document.createElement('div');
          presetsRow.className = 'agy-ai-presets-row';
          var presetTitle = document.createElement('span');
          presetTitle.className = 'agy-ai-hint';
          presetTitle.style.fontWeight = '600';
          presetTitle.textContent = 'Presets:';
          presetsRow.appendChild(presetTitle);

          presets.forEach(function (pr) {
            var chip = document.createElement('button');
            chip.type = 'button';
            var isCur = (curProv.baseUrl || '').replace(/\/+$/, '') === pr.baseUrl.replace(/\/+$/, '')
              && (curProv.wireProtocol || 'openai') === pr.wireProtocol;
            chip.className = 'agy-ai-preset-chip' + (isCur ? ' active' : '');
            chip.textContent = pr.label;
            chip.addEventListener('click', function () {
              curProv.baseUrl = pr.baseUrl;
              curProv.wireProtocol = pr.wireProtocol;
              render();
            });
            presetsRow.appendChild(chip);
          });
          keySec.appendChild(presetsRow);
        }

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

        var clearKeyBtn = document.createElement('button');
        clearKeyBtn.type = 'button';
        clearKeyBtn.className = 'agy-ai-btn';
        clearKeyBtn.textContent = 'Clear';
        clearKeyBtn.title = 'Clear saved API key for this provider';
        clearKeyBtn.addEventListener('click', function () {
          curProv.apiKey = '';
          render();
        });

        keyRow.appendChild(keyInput);
        keyRow.appendChild(toggleShowBtn);
        if (curProv.apiKey) {
          keyRow.appendChild(clearKeyBtn);
        }
        keySec.appendChild(keyRow);

        // Endpoint URL & Wire Protocol row
        var urlRow = document.createElement('div');
        urlRow.className = 'agy-ai-row';

        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'agy-ai-input';
        urlInput.placeholder = 'Base URL (https://...)';
        urlInput.value = curProv.baseUrl || '';

        var protoSelect = document.createElement('select');
        protoSelect.className = 'agy-ai-select';
        protoSelect.style.maxWidth = '210px';
        var optOpenAi = document.createElement('option');
        optOpenAi.value = 'openai';
        optOpenAi.textContent = 'Protocol: OpenAI (/v1/chat)';
        var optAnthropic = document.createElement('option');
        optAnthropic.value = 'anthropic';
        optAnthropic.textContent = 'Protocol: Anthropic (/v1/messages)';
        var optGenAi = document.createElement('option');
        optGenAi.value = 'genai';
        optGenAi.textContent = 'Protocol: Gemini (/v1beta)';
        protoSelect.appendChild(optOpenAi);
        protoSelect.appendChild(optAnthropic);
        protoSelect.appendChild(optGenAi);
        var activeProto = curProv.wireProtocol || 'openai';
        if (activeProto !== 'genai' && activeProto !== 'anthropic') {
          activeProto = 'openai';
        }
        protoSelect.value = activeProto;

        // Live Endpoint Preview banner
        var endpointPreview = document.createElement('div');
        endpointPreview.className = 'agy-ai-endpoint-preview';
        function updateEndpointPreview() {
          endpointPreview.textContent = 'Target Endpoint: ' + resolveEndpointPreviewUrl(
            selectedProv,
            curProv.baseUrl,
            curProv.wireProtocol
          );
        }
        updateEndpointPreview();

        urlInput.addEventListener('input', function (e) {
          curProv.baseUrl = e.target.value;
          updateEndpointPreview();
        });

        protoSelect.addEventListener('change', function (e) {
          curProv.wireProtocol = e.target.value;
          updateEndpointPreview();
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
            if (res && res.ok) {
              var existingMap = {};
              (curProv.models || []).forEach(function (m) {
                if (m && m.modelId) existingMap[m.modelId] = m;
              });
              var added = 0;
              var fetchedList = Array.isArray(res.models) ? res.models : [];
              fetchedList.forEach(function (m) {
                if (!m || !m.modelId) return;
                if (!existingMap[m.modelId]) {
                  curProv.models.push(m);
                  existingMap[m.modelId] = m;
                  added++;
                }
              });
              if (res.verifiedViaProbe) {
                setStatus('ok', 'Custom Endpoint & API Key verified via live message probe! (' + (curProv.models || []).length + ' model(s) ready).');
              } else {
                setStatus('ok', 'API Key verified! Found ' + fetchedList.length + ' model(s) (' + added + ' new added).');
              }
            } else {
              setStatus('err', 'Failed to verify endpoint: ' + (res && res.error ? res.error : 'Please verify your API Key and Base URL'));
            }
          });
        });

        urlRow.appendChild(urlInput);
        urlRow.appendChild(protoSelect);
        urlRow.appendChild(testBtn);
        keySec.appendChild(urlRow);
        keySec.appendChild(endpointPreview);

        // Expandable Custom HTTP Headers section (for proxies / custom Anthropic headers)
        var headersToggleRow = document.createElement('div');
        headersToggleRow.className = 'agy-ai-row';
        headersToggleRow.style.justifyContent = 'space-between';

        var hdrCount = curProv.customHeaders ? Object.keys(curProv.customHeaders).length : 0;
        var headersBtn = document.createElement('button');
        headersBtn.type = 'button';
        headersBtn.className = 'agy-ai-btn agy-ai-btn-sm';
        headersBtn.textContent = (showCustomHeaders ? '▾ Hide Custom Headers' : '▸ Custom HTTP Headers')
          + (hdrCount > 0 ? ' (' + hdrCount + ' active)' : ' (Optional)');
        headersBtn.addEventListener('click', function () {
          showCustomHeaders = !showCustomHeaders;
          render();
        });
        headersToggleRow.appendChild(headersBtn);
        keySec.appendChild(headersToggleRow);

        if (showCustomHeaders) {
          var headersArea = document.createElement('textarea');
          headersArea.className = 'agy-ai-textarea';
          headersArea.placeholder = 'Optional custom HTTP headers (one per line "Header-Name: value" or JSON):\nanthropic-beta: output-128k-2025-02-19\nX-Custom-Proxy-Token: secret';
          headersArea.value = formatCustomHeadersText(curProv.customHeaders);
          headersArea.spellcheck = false;
          headersArea.addEventListener('input', function (e) {
            curProv.customHeaders = parseCustomHeadersText(e.target.value);
          });
          keySec.appendChild(headersArea);
        }

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
        var allModels = curProv.models || [];
        var activeCount = allModels.filter(function (m) { return m && m.enabled !== false; }).length;
        modLabel.textContent = '3. AI Models (' + activeCount + ' / ' + allModels.length + ' enabled)';

        var headerActions = document.createElement('div');
        headerActions.className = 'agy-ai-row';
        headerActions.style.width = 'auto';

        if (allModels.length > 2) {
          var toggleAllBtn = document.createElement('button');
          toggleAllBtn.type = 'button';
          toggleAllBtn.className = 'agy-ai-btn agy-ai-btn-sm';
          var allEnabled = activeCount === allModels.length;
          toggleAllBtn.textContent = allEnabled ? 'Disable All' : 'Enable All';
          toggleAllBtn.addEventListener('click', function () {
            var nextState = !allEnabled;
            (curProv.models || []).forEach(function (m) {
              if (m) m.enabled = nextState;
            });
            render();
          });
          headerActions.appendChild(toggleAllBtn);
        }

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
            curProv.customHeaders = {};
            render();
          }
        });
        headerActions.appendChild(resetDefaultBtn);

        modHeaderRow.appendChild(modLabel);
        modHeaderRow.appendChild(headerActions);
        modSec.appendChild(modHeaderRow);

        if (allModels.length > 5) {
          var filterInput = document.createElement('input');
          filterInput.type = 'text';
          filterInput.className = 'agy-ai-input';
          filterInput.style.height = '32px';
          filterInput.style.fontSize = '12px';
          filterInput.placeholder = 'Filter models by name or ID...';
          filterInput.value = modelFilterQuery;
          filterInput.addEventListener('input', function (e) {
            modelFilterQuery = e.target.value || '';
            render();
            var refocused = modal.querySelector('[data-agy-model-filter]');
            if (refocused) {
              refocused.focus();
              try {
                refocused.setSelectionRange(modelFilterQuery.length, modelFilterQuery.length);
              } catch (_) {}
            }
          });
          filterInput.setAttribute('data-agy-model-filter', '1');
          modSec.appendChild(filterInput);
        }

        var modList = document.createElement('div');
        modList.className = 'agy-ai-models-list';

        var qLower = (modelFilterQuery || '').trim().toLowerCase();

        allModels.forEach(function (m, idx) {
          if (!m) return;
          if (qLower) {
            var hay = ((m.displayName || '') + ' ' + (m.modelId || '')).toLowerCase();
            if (hay.indexOf(qLower) === -1) return;
          }
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
          var ctxLabel = formatTokenCount(m.maxTokens);
          mId.textContent = m.modelId + (ctxLabel ? ' • ' + ctxLabel : '');
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
        newIdInput.placeholder = (curProv.wireProtocol === 'anthropic' || selectedProv === 'anthropic' || selectedProv === 'custom_anthropic')
          ? 'New Model ID (e.g. claude-sonnet-4-5-20250929 / glm-4.5)'
          : 'New Model ID (e.g. gpt-4.1-nano / gemini-2.5-pro)';

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
            || idVal.indexOf('claude-sonnet-4') !== -1 || idVal.indexOf('claude-opus-4') !== -1
            || idVal.indexOf('claude-4') !== -1;
          var isClaude = idVal.indexOf('claude') !== -1 || curProv.wireProtocol === 'anthropic';
          curProv.models = curProv.models || [];
          curProv.models.unshift({
            modelId: idVal,
            displayName: nameVal,
            supportsThinking: isThink,
            enabled: true,
            maxTokens: isClaude ? 200000 : 128000,
            maxOutputTokens: isClaude ? 64000 : 16384
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
      if (cfg.enabled && selectedProv !== 'multi' && !isKeylessAllowed(selectedProv)) {
        var p = cfg.providers[selectedProv];
        if (!p || ((!p.apiKey || !p.apiKey.trim()) && !hasCustomHeadersConfigured(p))) {
          setStatus('err', 'Please enter an API Key for ' + (p ? p.name : selectedProv) + ' first.');
          return;
        }
      }
      if (cfg.enabled && isKeylessAllowed(selectedProv)) {
        var cp = cfg.providers[selectedProv];
        if (!cp || !cp.baseUrl || !cp.baseUrl.trim()) {
          setStatus('err', 'Please enter a valid Base URL for ' + (cp ? cp.name : selectedProv) + '.');
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

    if (prevBodyScroll > 0) {
      body.scrollTop = prevBodyScroll;
    }
    var newListEl = modal.querySelector('.agy-ai-models-list');
    if (newListEl && prevListScroll > 0) {
      newListEl.scrollTop = prevListScroll;
    }
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
