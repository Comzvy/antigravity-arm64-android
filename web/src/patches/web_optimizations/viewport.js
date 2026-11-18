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

