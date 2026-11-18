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

