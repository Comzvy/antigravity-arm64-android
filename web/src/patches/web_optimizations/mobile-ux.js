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

