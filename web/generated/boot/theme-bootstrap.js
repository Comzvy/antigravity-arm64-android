// Fast theme bootstrap. Runs before the app bundle so the first paint already
// uses the host-selected color scheme, and shims matchMedia('(prefers-color-scheme: ...)')
// to query the native Android system theme directly (Android WebView's built-in
// prefers-color-scheme media query does not track OS dark mode on targetSdk 28).
(function () {
  'use strict';

  function getSystemDark() {
    if (typeof window !== 'undefined') {
      if (window.Android && typeof window.Android.getSystemTheme === 'function') {
        try {
          var st = window.Android.getSystemTheme();
          if (st === 'dark' || st === 'light') return st === 'dark';
        } catch (e) {}
      }
      if (window.__AG_SYSTEM_THEME__ === 'dark' || window.__AG_SYSTEM_THEME__ === 'light') {
        return window.__AG_SYSTEM_THEME__ === 'dark';
      }
      if (window.Android && typeof window.Android.getTheme === 'function') {
        try {
          var t = window.Android.getTheme();
          if (t === 'dark' || t === 'light') return t === 'dark';
        } catch (e) {}
      }
      if (window.__AG_RESOLVED_THEME__ === 'dark' || window.__AG_RESOLVED_THEME__ === 'light') {
        return window.__AG_RESOLVED_THEME__ === 'dark';
      }
    }
    return false;
  }

  // Shim prefers-color-scheme media queries so main.js (TY / eAc) and
  // theme_sync observe real Android OS night-mode state and live transitions.
  var systemListeners = [];
  var origMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;

  function makeSchemeMql(query, wantsDark) {
    var mql = {
      media: query,
      get matches() {
        var dark = getSystemDark();
        return wantsDark ? dark : !dark;
      },
      onchange: null,
      addListener: function (cb) {
        if (typeof cb === 'function' && systemListeners.indexOf(cb) === -1) {
          systemListeners.push(cb);
        }
      },
      removeListener: function (cb) {
        var idx = systemListeners.indexOf(cb);
        if (idx !== -1) systemListeners.splice(idx, 1);
      },
      addEventListener: function (type, cb) {
        if (type === 'change') mql.addListener(cb);
      },
      removeEventListener: function (type, cb) {
        if (type === 'change') mql.removeListener(cb);
      },
      dispatchEvent: function () { return true; }
    };
    return mql;
  }

  window.matchMedia = function (query) {
    var q = String(query || '').toLowerCase();
    if (q.indexOf('prefers-color-scheme') !== -1) {
      if (q.indexOf('dark') !== -1) {
        return makeSchemeMql(query, true);
      }
      if (q.indexOf('light') !== -1) {
        return makeSchemeMql(query, false);
      }
    }
    if (origMatchMedia) {
      return origMatchMedia(query);
    }
    return makeSchemeMql(query, false);
  };

  window.__agOnSystemThemeChanged = function () {
    var dark = getSystemDark();
    var ev = { matches: dark, media: '(prefers-color-scheme: dark)' };
    var snapshot = systemListeners.slice();
    for (var i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](ev);
      } catch (e) {}
    }
    if (window.__agThemeSync && typeof window.__agThemeSync.sync === 'function') {
      try {
        window.__agThemeSync.sync();
      } catch (e) {}
    }
  };

  var theme = 'system';
  try {
    var params = new URLSearchParams(window.location.search);
    theme = params.get('hostTheme') || window.__AG_HOST_THEME__ || 'system';
  } catch (e) {
    theme = window.__AG_HOST_THEME__ || 'system';
  }
  if (theme === 'system') {
    theme = getSystemDark() ? 'dark' : 'light';
  } else {
    theme = theme === 'light' ? 'light' : 'dark';
  }

  document.documentElement.style.colorScheme = theme;
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(theme);
})();

