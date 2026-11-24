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
    var plusTouch = null;
    var lastPlusSyntheticClickMs = 0;

    function isEditableEl(el) {
      if (!el) return false;
      if (el.isContentEditable) return true;
      var tag = (el.tagName || '').toLowerCase();
      return tag === 'textarea' || tag === 'input' || tag === 'select';
    }

    function getComposerPlusButton(target) {
      if (!target || typeof target.closest !== 'function') return null;
      return target.closest('button[aria-label="Add context"]');
    }

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

    // Issue #1 fix: prevent mousedown on the composer "+" button from blurring the
    // editable input mid-tap (which shrinks the IME and shifts the viewport away
    // before click fires), then dismiss the keyboard when click opens the menu.
    doc.addEventListener('touchstart', function (ev) {
      try {
        if (!ev.touches || ev.touches.length !== 1) { plusTouch = null; return; }
        var btn = getComposerPlusButton(ev.target);
        if (!btn || btn.disabled) { plusTouch = null; return; }
        var touch = ev.touches[0];
        plusTouch = {
          btn: btn,
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
          wasEditable: isEditableEl(doc.activeElement),
          clicked: false
        };
      } catch (_) {}
    }, { passive: true, capture: true });

    doc.addEventListener('mousedown', function (ev) {
      try {
        var btn = getComposerPlusButton(ev.target);
        if (btn && !btn.disabled && isEditableEl(doc.activeElement)) {
          ev.preventDefault();
        }
      } catch (_) {}
    }, { passive: false, capture: true });

    doc.addEventListener('click', function (ev) {
      try {
        var btn = getComposerPlusButton(ev.target);
        if (!btn) return;
        var now = Date.now();
        if (ev.isTrusted && (now - lastPlusSyntheticClickMs < 140)) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (plusTouch && plusTouch.btn === btn && ev.isTrusted) {
          plusTouch.clicked = true;
        }
        if (isEditableEl(doc.activeElement)) {
          doc.activeElement.blur();
        }
      } catch (_) {}
    }, true);

    doc.addEventListener('touchend', function (ev) {
      try {
        var state = plusTouch;
        if (!state || !ev.changedTouches || ev.changedTouches.length === 0) return;
        var touch = ev.changedTouches[0];
        var dt = Date.now() - state.time;
        var dx = touch.clientX - state.x;
        var dy = touch.clientY - state.y;
        if (dt > 600 || (dx * dx + dy * dy) > 196) {
          plusTouch = null;
          return;
        }
        setTimeout(function () {
          try {
            if (!state.clicked && state.wasEditable && state.btn && state.btn.isConnected) {
              if (isEditableEl(doc.activeElement)) {
                doc.activeElement.blur();
              }
              lastPlusSyntheticClickMs = Date.now();
              state.btn.click();
            }
          } catch (_) {}
          if (plusTouch === state) plusTouch = null;
        }, 80);
      } catch (_) {}
    }, { passive: true, capture: true });

    doc.addEventListener('touchcancel', function () {
      plusTouch = null;
    }, { passive: true, capture: true });
  } catch (e) {}
}

