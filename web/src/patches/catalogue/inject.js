/**
 * patches/catalogue/inject.js - Injects Skills & Plugins Catalogue entry card into Customizations & Plugins settings.
 */

var CATALOGUE_CARD_MARKER = 'data-agy-catalogue-card';

function findCatalogueHostColumn(el) {
  var cur = el;
  while (cur && cur !== document.body) {
    var cls = typeof cur.className === 'string' ? cur.className : '';
    if (cls.indexOf('space-y-6') !== -1 || cls.indexOf('flex-col') !== -1 && (cls.indexOf('gap-8') !== -1 || cls.indexOf('max-w-') !== -1)) {
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

function scanAndInjectCatalogueCard() {
  try {
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
