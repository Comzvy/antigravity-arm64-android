/**
 * patches/catalogue/inject.js - Injects Skills & Plugins Catalogue entry into Settings & Customizations UI.
 */

var CATALOGUE_CARD_MARKER = 'data-agy-catalogue-card';
var CATALOGUE_NAV_MARKER = 'data-agy-catalogue-nav';

function findCatalogueHostColumn(el) {
  var cur = el;
  while (cur && cur !== document.body) {
    var cls = typeof cur.className === 'string' ? cur.className : '';
    if (cls.indexOf('space-y-6') !== -1 || (cls.indexOf('flex-col') !== -1 && (cls.indexOf('gap-8') !== -1 || cls.indexOf('max-w-') !== -1))) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function createCatalogueInlineCard() {
  ensureCatalogueStyles();
  var card = document.createElement('div');
  card.className = 'agy-cat-inline-card';
  card.setAttribute(CATALOGUE_CARD_MARKER, '1');

  var top = document.createElement('div');
  top.className = 'agy-cat-row';
  top.style.justifyContent = 'space-between';

  var info = document.createElement('div');
  info.style.flex = '1';
  info.style.minWidth = '180px';

  var title = document.createElement('div');
  title.style.fontSize = '14px';
  title.style.fontWeight = '600';
  title.textContent = 'Skills & Plugins Catalogue (' + CATALOGUE_PLUGINS.length + ' Plugins · ' + CATALOGUE_SKILLS.length + ' Skills)';

  var desc = document.createElement('div');
  desc.className = 'agy-cat-desc';
  desc.style.marginTop = '3px';
  desc.textContent = 'Browse and install RTK, Anti-Slop, Superpowers, Impeccable, Context Mode, Agents Suite, Sepia, and 20+ agent skills.';

  info.appendChild(title);
  info.appendChild(desc);

  var btns = document.createElement('div');
  btns.className = 'agy-cat-row';

  var plugBtn = document.createElement('button');
  plugBtn.type = 'button';
  plugBtn.className = 'agy-cat-btn agy-cat-btn-primary';
  plugBtn.textContent = 'Browse Plugins';
  plugBtn.addEventListener('click', function () {
    openCatalogueModal('plugins');
  });

  var skillBtn = document.createElement('button');
  skillBtn.type = 'button';
  skillBtn.className = 'agy-cat-btn';
  skillBtn.textContent = 'Browse Skills';
  skillBtn.addEventListener('click', function () {
    openCatalogueModal('skills');
  });

  btns.appendChild(plugBtn);
  btns.appendChild(skillBtn);

  top.appendChild(info);
  top.appendChild(btns);
  card.appendChild(top);
  return card;
}

function injectSettingsNavItems() {
  var anchors = document.querySelectorAll(
    '[data-testid="settings-nav-item-Models"], [data-testid="settings-nav-item-Appearance"], [data-testid="settings-nav-item-General"]'
  );
  var processedHosts = [];

  for (var i = 0; i < anchors.length; i++) {
    var anchor = anchors[i];
    var sidebar = typeof anchor.closest === 'function' ? anchor.closest('[data-testid="settings-sidebar"]') : null;

    if (sidebar) {
      if (processedHosts.indexOf(sidebar) !== -1) continue;
      processedHosts.push(sidebar);
      if (sidebar.querySelector('[' + CATALOGUE_NAV_MARKER + ']')) continue;

      var sideTarget =
        sidebar.querySelector('[data-testid="settings-nav-item-Models"]') ||
        sidebar.querySelector('[data-testid="settings-nav-item-Appearance"]') ||
        sidebar.querySelector('[data-testid="settings-nav-item-General"]') ||
        anchor;
      var anchorRow = sideTarget.parentElement;
      if (!anchorRow || !anchorRow.parentElement) continue;

      var clonedRow = anchorRow.cloneNode(true);
      clonedRow.setAttribute(CATALOGUE_NAV_MARKER, '1');

      var sideBtn = clonedRow.querySelector('button');
      if (!sideBtn) continue;

      var kids = Array.prototype.slice.call(clonedRow.children || []);
      for (var k = 0; k < kids.length; k++) {
        if (kids[k] !== sideBtn && kids[k].parentNode === clonedRow) {
          clonedRow.removeChild(kids[k]);
        }
      }

      sideBtn.setAttribute('data-testid', 'settings-nav-item-SkillsPlugins');
      if (sideBtn.classList) {
        sideBtn.classList.remove('bg-sidebar-secondary');
        sideBtn.classList.add('hover:bg-sidebar-muted');
      }

      var sideSpan = sideBtn.querySelector('span');
      if (sideSpan) {
        sideSpan.textContent = 'Skills & Plugins';
        if (sideSpan.classList) {
          sideSpan.classList.remove('text-foreground');
          sideSpan.classList.add('text-secondary-foreground');
        }
      } else {
        sideBtn.textContent = 'Skills & Plugins';
      }

      sideBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openCatalogueModal('plugins');
      });

      anchorRow.parentElement.insertBefore(clonedRow, anchorRow.nextSibling);
    } else {
      var container = anchor.parentElement;
      if (!container) continue;
      if (processedHosts.indexOf(container) !== -1) continue;
      processedHosts.push(container);
      if (container.querySelector('[' + CATALOGUE_NAV_MARKER + ']')) continue;

      var mobTarget =
        container.querySelector('[data-testid="settings-nav-item-Models"]') ||
        container.querySelector('[data-testid="settings-nav-item-Appearance"]') ||
        container.querySelector('[data-testid="settings-nav-item-General"]') ||
        anchor;

      var clonedBtn = mobTarget.cloneNode(true);
      clonedBtn.setAttribute(CATALOGUE_NAV_MARKER, '1');
      clonedBtn.setAttribute('data-testid', 'settings-nav-item-SkillsPlugins');

      var mobSpan = clonedBtn.querySelector('span');
      if (mobSpan) {
        mobSpan.textContent = 'Skills & Plugins';
      } else {
        clonedBtn.textContent = 'Skills & Plugins';
      }

      clonedBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openCatalogueModal('plugins');
      });

      container.insertBefore(clonedBtn, mobTarget.nextSibling);
    }
  }
}

function findMaxW4xlAncestor(el) {
  var cur = el;
  while (cur && cur !== document.body) {
    var cls = typeof cur.className === 'string' ? cur.className : '';
    if (cls.indexOf('max-w-4xl') !== -1) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function injectPluginsPageCard() {
  var triggers = [];
  var tabs = document.querySelectorAll('[data-testid="plugins-tabs"]');
  for (var t = 0; t < tabs.length; t++) {
    triggers.push(tabs[t]);
  }
  var headings = document.querySelectorAll('h1');
  for (var h = 0; h < headings.length; h++) {
    if ((headings[h].textContent || '').trim() === 'Customizations') {
      triggers.push(headings[h]);
    }
  }

  for (var i = 0; i < triggers.length; i++) {
    var headerBox = findMaxW4xlAncestor(triggers[i]);
    if (!headerBox) continue;
    var stickyHeader = headerBox.parentElement;
    var targetBox = (stickyHeader && stickyHeader.nextElementSibling) ? stickyHeader.nextElementSibling : headerBox;
    if (!targetBox || targetBox.querySelector('[' + CATALOGUE_CARD_MARKER + ']')) continue;

    var card = createCatalogueInlineCard();
    card.style.marginBottom = '16px';
    if (targetBox.firstChild) {
      targetBox.insertBefore(card, targetBox.firstChild);
    } else {
      targetBox.appendChild(card);
    }
  }
}

function scanAndInjectCatalogueCard() {
  try {
    injectSettingsNavItems();
    injectPluginsPageCard();

    var nodes = document.querySelectorAll('div, p, span');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = (el.textContent || '').trim();
      if (text === 'Browse and enable plugins from the Build With Google catalog.' ||
          text === 'When enabled, the agent will include default customizations, including default skills.' ||
          text.indexOf('Plugins are packaged collections of skills and MCPs') === 0 ||
          text.indexOf('Configure default behaviors, skills, and MCP servers.') === 0) {
        var hostCol = findCatalogueHostColumn(el);
        if (hostCol && !hostCol.querySelector('[' + CATALOGUE_CARD_MARKER + ']')) {
          var card = createCatalogueInlineCard();
          if (hostCol.firstChild) {
            hostCol.insertBefore(card, hostCol.firstChild);
          } else {
            hostCol.appendChild(card);
          }
        }
      }
    }
  } catch (_) {}
}

function installCatalogueInjector() {
  var scheduled = false;
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      scanAndInjectCatalogueCard();
    });
  });

  function start() {
    if (!document.body) return;
    scanAndInjectCatalogueCard();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

installCatalogueInjector();
