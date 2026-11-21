(function(){
/**
 * patches/web_optimizations/taps.js - eliminate 300ms double-tap delay, refine
 * touch targets/scrollbars, and wire native Android haptic feedback on taps.
 */
'use strict';

function triggerNativeHaptic(type) {
  try {
    var a = window.Android || window.AndroidBridge;
    if (a && typeof a.performHapticFeedback === 'function') {
      a.performHapticFeedback(type || 'tap');
    }
  } catch (e) {}
}

function installTaps(doc) {
  try {
    var style = doc.createElement('style');
    style.setAttribute('data-agy', 'web-optimizations');
    style.textContent = [
      'button,a,[role="button"],[role="tab"],[role="menuitem"],input,select,textarea,summary{',
      '  touch-action:manipulation;',
      '  -webkit-tap-highlight-color:transparent;',
      '}',
      'button,[role="button"],[role="tab"],[role="menuitem"]{',
      '  user-select:none;',
      '  -webkit-user-select:none;',
      '  transition:transform 0.08s ease,opacity 0.12s ease;',
      '}',
      'button:active:not(:disabled),[role="button"]:active:not([aria-disabled="true"]){',
      '  transform:scale(0.96);',
      '}',
      'pre,code,.xterm,.monaco-editor,[data-testid="chat-container"],.prose{',
      '  user-select:text;',
      '  -webkit-user-select:text;',
      '}',
      '::-webkit-scrollbar{width:4px;height:4px;}',
      '::-webkit-scrollbar-track{background:transparent;}',
      '::-webkit-scrollbar-thumb{background:rgba(148,163,184,0.28);border-radius:999px;}',
      '::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,0.45);}',
      '@media (max-width: 768px){',
      '  input:not([type="checkbox"]):not([type="radio"]),select,textarea{',
      '    font-size:15px;',
      '  }',
      '}'
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(style);

    var lastHapticMs = 0;
    doc.addEventListener('pointerdown', function (ev) {
      try {
        var now = Date.now();
        if (now - lastHapticMs < 45) return;
        var t = ev.target;
        if (!t || typeof t.closest !== 'function') return;
        var interactive = t.closest('button,[role="button"],[role="tab"],[role="menuitem"],a[href],summary');
        if (interactive && !interactive.disabled && interactive.getAttribute('aria-disabled') !== 'true') {
          lastHapticMs = now;
          triggerNativeHaptic('tap');
        }
      } catch (_) {}
    }, { passive: true, capture: true });
  } catch (e) {}
}


/**
 * patches/web_optimizations/viewport.js - keep --agy-vvh and --agy-kb-inset
 * accurate while the Android soft keyboard opens/closes, and smoothly scroll
 * focused inputs into view above the keyboard.
 */
function installViewport(global, doc) {
  try {
    var rootEl = doc.documentElement;
    if (!rootEl) return;

    var maxSeenHeight = global.innerHeight || 0;

    function updateViewportMetrics() {
      var vv = global.visualViewport;
      var vvh = vv && vv.height ? Math.round(vv.height) : (global.innerHeight || 0);
      var winH = Math.max(global.innerHeight || 0, vvh);
      if (winH > maxSeenHeight) {
        maxSeenHeight = winH;
      }
      var kbInset = Math.max(0, (maxSeenHeight || winH) - vvh);
      var kbOpen = kbInset > 110;

      rootEl.style.setProperty('--agy-vvh', vvh + 'px');
      rootEl.style.setProperty('--agy-kb-inset', kbInset + 'px');
      if (kbOpen) {
        rootEl.setAttribute('data-agy-kb-open', 'true');
      } else {
        rootEl.removeAttribute('data-agy-kb-open');
      }

      if (kbOpen && doc.activeElement) {
        var tag = (doc.activeElement.tagName || '').toLowerCase();
        var isEditable = tag === 'textarea' || tag === 'input' || doc.activeElement.isContentEditable;
        if (isEditable && typeof doc.activeElement.scrollIntoView === 'function') {
          setTimeout(function () {
            try {
              doc.activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } catch (_) {}
          }, 60);
        }
      }
    }

    updateViewportMetrics();

    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', updateViewportMetrics, { passive: true });
      global.visualViewport.addEventListener('scroll', updateViewportMetrics, { passive: true });
    }
    global.addEventListener('resize', updateViewportMetrics, { passive: true });
    global.addEventListener('orientationchange', function () {
      maxSeenHeight = 0;
      setTimeout(updateViewportMetrics, 150);
    }, { passive: true });
  } catch (e) {}
}


/**
 * patches/web_optimizations/gpu.js - GPU-accelerate scroll/animation surfaces
 * and isolate layout for lists.
 */
function installGpu(doc) {
  try {
    if (!doc.querySelector('style[data-agy="gpu-acceleration"]')) {
      var gpu = doc.createElement('style');
      gpu.setAttribute('data-agy', 'gpu-acceleration');
      // Promote ONLY the real scroll containers. Never inline <code>/<pre>:
      // per-element layers explode on Mali and saturate RenderThread.
      gpu.textContent =
        'main, [data-testid="chat-container"], .scrollable {' +
        ' transform: translateZ(0);' +
        ' -webkit-overflow-scrolling: touch; }' +
        '[role="listitem"], .message-row, .artifact-viewer {' +
        ' contain: layout style; }' +
        '*{ -webkit-tap-highlight-color: transparent; }';
      (doc.head || doc.documentElement).appendChild(gpu);
    }
  } catch (e) {}
}

/**
 * patches/web_optimizations/mobile-ux.js - Android mobile UX enhancements:
 * Smart Android Hardware Back Handler (`window.__agHandleAndroidBack`) to close
 * open modals/dialogs cleanly before exiting or minimizing the app.
 */

function isEditableInputTarget(el) {
  if (!el) return false;
  var tag = (el.tagName || '').toLowerCase();
  if (tag === 'textarea') return true;
  if (el.isContentEditable) return true;
  if (tag === 'input') {
    var type = (el.type || 'text').toLowerCase();
    return type === 'text' || type === 'search' || type === 'url' || type === 'email';
  }
  return false;
}

function installAndroidBackHandler(global, doc) {
  global.__agHandleAndroidBack = function () {
    try {
      // 1. Close Skills & Plugins Catalogue or AI Models modal if open
      var catBackdrop = doc.querySelector('.agy-cat-backdrop');
      if (catBackdrop) {
        if (global.__agCatalogue && typeof global.__agCatalogue.closeModal === 'function') {
          global.__agCatalogue.closeModal();
          return true;
        }
        catBackdrop.remove();
        return true;
      }

      var aiBackdrop = doc.querySelector('.agy-ai-backdrop');
      if (aiBackdrop) {
        var aiApi = global.__agAiModels || global.__agAiModelsMenu;
        if (aiApi && typeof aiApi.closeModal === 'function') {
          aiApi.closeModal();
          return true;
        }
        aiBackdrop.remove();
        return true;
      }

      // 2. Close any open Radix / HeadlessUI / standard dialog or popover
      var openDialogs = doc.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]');
      if (openDialogs && openDialogs.length > 0) {
        doc.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true
        }));
        return true;
      }

      // 3. Blur active input if focused
      if (doc.activeElement && isEditableInputTarget(doc.activeElement)) {
        doc.activeElement.blur();
        return true;
      }
    } catch (_) {}
    return false;
  };
}

function installMobileLayoutStyles(doc) {
  if (doc.querySelector('style[data-agy="mobile-layout-fixes"]')) return;
  var style = doc.createElement('style');
  style.setAttribute('data-agy', 'mobile-layout-fixes');
  style.textContent = [
    '.entrance-auth-panel {',
    '  width: 100% !important;',
    '  max-width: 100vw !important;',
    '  padding-left: 20px !important;',
    '  padding-right: 20px !important;',
    '  box-sizing: border-box !important;',
    '}',
    '.entrance-auth-panel > div {',
    '  width: 100% !important;',
    '  max-width: min(440px, calc(100vw - 40px)) !important;',
    '  box-sizing: border-box !important;',
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    '}',
    '.entrance-auth-panel button {',
    '  max-width: 100% !important;',
    '  box-sizing: border-box !important;',
    '}',
    '@media (max-width: 540px) {',
    '  [class*="w-[480px]"] {',
    '    width: min(100%, calc(100vw - 40px)) !important;',
    '    max-width: min(440px, calc(100vw - 40px)) !important;',
    '    box-sizing: border-box !important;',
    '    margin-left: auto !important;',
    '    margin-right: auto !important;',
    '  }',
    '  [role="radiogroup"].flex.gap-6 {',
    '    flex-wrap: wrap !important;',
    '    padding-left: 20px !important;',
    '    padding-right: 20px !important;',
    '    gap: 12px !important;',
    '    box-sizing: border-box !important;',
    '  }',
    '  [role="radiogroup"] > button.w-60 {',
    '    width: min(100%, 340px) !important;',
    '  }',
    '}'
  ].join('\n');
  (doc.head || doc.documentElement).appendChild(style);
}

function installMobileUx(global, doc) {
  try {
    installMobileLayoutStyles(doc);
    installAndroidBackHandler(global, doc);
  } catch (e) {}
}


/**
 * patches/web_optimizations/public-api.js - install and expose.
 */
var global = window;

if (global.__AG_WEB_OPTIMIZATIONS__) return;
global.__AG_WEB_OPTIMIZATIONS__ = true;

var doc = global.document;
if (!doc) return;

installTaps(doc);
installViewport(global, doc);
installGpu(doc);
installMobileUx(global, doc);

global.__agWebOptimizations = { installed: true };



})();
