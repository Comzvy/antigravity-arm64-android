/**
 * patches/catalogue/modal.js - Interactive Skills & Plugins Catalogue modal UI.
 */

var activeCatalogueBackdrop = null;
var activeCatalogueRender = null;
var catalogueJobsInFlight = {};
var catalogueChangesMade = false;
var catalogueStatus = { type: '', message: '' };

function installCatalogueEventListener() {
  if (window.__agCatalogueEventHooked) return;
  window.__agCatalogueEventHooked = true;
  var prev = window.__onAgCatalogueEvent;
  window.__onAgCatalogueEvent = function (ev) {
    if (typeof prev === 'function') {
      try { prev(ev); } catch (_) {}
    }
    if (!ev || !ev.id) return;
    var key = (ev.isPlugin ? 'plugin:' : 'skill:') + ev.id;
    if (ev.done) {
      delete catalogueJobsInFlight[key];
      if (ev.ok) {
        catalogueChangesMade = true;
        catalogueStatus = { type: 'ok', message: ev.message || (ev.id + ' installed successfully.') };
      } else {
        catalogueStatus = { type: 'err', message: ev.message || ('Failed installing ' + ev.id) };
      }
    } else {
      catalogueJobsInFlight[key] = true;
      catalogueStatus = { type: 'info', message: ev.message || ('Installing ' + ev.id + '...') };
    }
    if (typeof activeCatalogueRender === 'function') {
      activeCatalogueRender();
    }
  };
}

function closeCatalogueModal() {
  if (activeCatalogueBackdrop && activeCatalogueBackdrop.parentNode) {
    activeCatalogueBackdrop.parentNode.removeChild(activeCatalogueBackdrop);
  }
  activeCatalogueBackdrop = null;
  activeCatalogueRender = null;
}

function openCatalogueModal(initialTab) {
  ensureCatalogueStyles();
  installCatalogueEventListener();
  closeCatalogueModal();

  var activeTab = initialTab === 'skills' ? 'skills' : 'plugins';
  var selectedCategory = 'All';
  var searchQuery = '';
  var customRepoUrl = '';

  var backdrop = document.createElement('div');
  backdrop.className = 'agy-cat-backdrop';
  backdrop.addEventListener('click', function (ev) {
    if (ev.target === backdrop) {
      closeCatalogueModal();
    }
  });

  var modal = document.createElement('div');
  modal.className = 'agy-cat-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Skills & Plugins Catalogue');
  backdrop.appendChild(modal);
  activeCatalogueBackdrop = backdrop;

  function render() {
    var bodyEl = modal.querySelector('.agy-cat-body');
    var prevScroll = bodyEl ? bodyEl.scrollTop : 0;

    var installed = listInstalledFromBridge();
    var installedPluginsSet = {};
    installed.plugins.forEach(function (n) { installedPluginsSet[n] = true; });
    var installedSkillsSet = {};
    installed.skills.forEach(function (n) { installedSkillsSet[n] = true; });

    var items = activeTab === 'plugins' ? CATALOGUE_PLUGINS : CATALOGUE_SKILLS;
    var installedSet = activeTab === 'plugins' ? installedPluginsSet : installedSkillsSet;

    var catMap = { All: true };
    var categories = ['All'];
    items.forEach(function (it) {
      if (it.category && !catMap[it.category]) {
        catMap[it.category] = true;
        categories.push(it.category);
      }
    });
    if (!catMap[selectedCategory]) {
      selectedCategory = 'All';
    }

    var qLower = searchQuery.trim().toLowerCase();
    var filtered = items.filter(function (it) {
      if (selectedCategory !== 'All' && it.category !== selectedCategory) return false;
      if (qLower) {
        var hay = (it.name + ' ' + it.id + ' ' + it.category + ' ' + it.description).toLowerCase();
        if (hay.indexOf(qLower) === -1) return false;
      }
      return true;
    });

    modal.innerHTML = '';

    var pill = document.createElement('div');
    pill.className = 'agy-cat-drag-pill';
    modal.appendChild(pill);

    // Header
    var header = document.createElement('div');
    header.className = 'agy-cat-header';
    var titleWrap = document.createElement('div');
    var h2 = document.createElement('h2');
    h2.className = 'agy-cat-title';
    h2.textContent = 'Skills & Plugins Catalogue';
    var sub = document.createElement('div');
    sub.className = 'agy-cat-subtitle';
    sub.textContent = 'Install community plugins, quality filters, and agent skills directly into ~/.gemini/config';
    titleWrap.appendChild(h2);
    titleWrap.appendChild(sub);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'agy-cat-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeCatalogueModal);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'agy-cat-body';

    // Tabs
    var tabs = document.createElement('div');
    tabs.className = 'agy-cat-tabs';

    var tabPlugins = document.createElement('button');
    tabPlugins.type = 'button';
    tabPlugins.className = 'agy-cat-tab' + (activeTab === 'plugins' ? ' active' : '');
    tabPlugins.textContent = 'Plugins (' + CATALOGUE_PLUGINS.length + ')';
    tabPlugins.addEventListener('click', function () {
      activeTab = 'plugins';
      selectedCategory = 'All';
      render();
    });

    var tabSkills = document.createElement('button');
    tabSkills.type = 'button';
    tabSkills.className = 'agy-cat-tab' + (activeTab === 'skills' ? ' active' : '');
    tabSkills.textContent = 'Skills (' + CATALOGUE_SKILLS.length + ')';
    tabSkills.addEventListener('click', function () {
      activeTab = 'skills';
      selectedCategory = 'All';
      render();
    });

    tabs.appendChild(tabPlugins);
    tabs.appendChild(tabSkills);
    body.appendChild(tabs);

    if (catalogueStatus.message) {
      var st = document.createElement('div');
      st.className = 'agy-cat-status ' + (catalogueStatus.type || 'info');
      st.textContent = catalogueStatus.message;
      body.appendChild(st);
    }

    // Search + Custom URL install bar
    var searchRow = document.createElement('div');
    searchRow.className = 'agy-cat-row';
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'agy-cat-input';
    searchInput.placeholder = 'Search ' + activeTab + ' by name, category, or description...';
    searchInput.value = searchQuery;
    searchInput.setAttribute('data-agy-cat-search', '1');
    searchInput.addEventListener('input', function (e) {
      searchQuery = e.target.value || '';
      render();
      var refocused = modal.querySelector('[data-agy-cat-search]');
      if (refocused) {
        refocused.focus();
        try { refocused.setSelectionRange(searchQuery.length, searchQuery.length); } catch (_) {}
      }
    });
    searchRow.appendChild(searchInput);
    body.appendChild(searchRow);

    // Custom GitHub URL install row
    var customRow = document.createElement('div');
    customRow.className = 'agy-cat-row';
    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'agy-cat-input';
    urlInput.placeholder = 'Install custom ' + (activeTab === 'plugins' ? 'plugin' : 'skill') + ' from GitHub URL (https://github.com/owner/repo)';
    urlInput.value = customRepoUrl;
    urlInput.addEventListener('input', function (e) {
      customRepoUrl = e.target.value || '';
    });
    var urlBtn = document.createElement('button');
    urlBtn.type = 'button';
    urlBtn.className = 'agy-cat-btn agy-cat-btn-primary';
    urlBtn.textContent = 'Install URL';
    urlBtn.addEventListener('click', function () {
      var u = customRepoUrl.trim();
      if (!u) {
        catalogueStatus = { type: 'err', message: 'Enter a GitHub repository URL first.' };
        render();
        return;
      }
      var tail = u.replace(/\/+$/, '').replace(/\.git$/i, '').split('/').pop() || 'custom-item';
      var cleanId = tail.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
      var res = installCatalogueItemViaBridge({
        id: cleanId,
        name: tail,
        description: 'Custom ' + (activeTab === 'plugins' ? 'plugin' : 'skill') + ' from ' + u,
        category: 'Custom',
        isPlugin: activeTab === 'plugins',
        repoUrl: u,
        subPath: ''
      });
      if (!res.ok) {
        catalogueStatus = { type: 'err', message: res.error || 'Failed starting installation' };
        render();
      } else {
        customRepoUrl = '';
        catalogueJobsInFlight[(activeTab === 'plugins' ? 'plugin:' : 'skill:') + cleanId] = true;
        catalogueStatus = { type: 'info', message: 'Installing ' + tail + '...' };
        render();
      }
    });
    customRow.appendChild(urlInput);
    customRow.appendChild(urlBtn);
    body.appendChild(customRow);

    // Category filter chips
    var chips = document.createElement('div');
    chips.className = 'agy-cat-chips';
    categories.forEach(function (cat) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'agy-cat-chip' + (selectedCategory === cat ? ' active' : '');
      chip.textContent = cat;
      chip.addEventListener('click', function () {
        selectedCategory = cat;
        render();
      });
      chips.appendChild(chip);
    });
    body.appendChild(chips);

    // Cards list
    var list = document.createElement('div');
    list.className = 'agy-cat-list';
    if (filtered.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'agy-cat-desc';
      empty.style.padding = '16px 0';
      empty.style.textAlign = 'center';
      empty.textContent = 'No ' + activeTab + ' match your search.';
      list.appendChild(empty);
    } else {
      filtered.forEach(function (item) {
        var key = (item.isPlugin ? 'plugin:' : 'skill:') + item.id;
        var isBusy = Boolean(catalogueJobsInFlight[key]);
        var isInstalled = Boolean(installedSet[item.id]);

        var card = document.createElement('div');
        card.className = 'agy-cat-card';

        var top = document.createElement('div');
        top.className = 'agy-cat-card-top';

        var info = document.createElement('div');
        info.style.flex = '1';
        info.style.minWidth = '0';

        var nameRow = document.createElement('div');
        nameRow.className = 'agy-cat-name-row';
        var nameEl = document.createElement('span');
        nameEl.className = 'agy-cat-name';
        nameEl.textContent = item.name;
        nameRow.appendChild(nameEl);

        if (item.category) {
          var catPill = document.createElement('span');
          catPill.className = 'agy-cat-pill';
          catPill.textContent = item.category;
          nameRow.appendChild(catPill);
        }
        if (isInstalled) {
          var instPill = document.createElement('span');
          instPill.className = 'agy-cat-pill installed';
          instPill.textContent = 'Installed';
          nameRow.appendChild(instPill);
        }
        info.appendChild(nameRow);

        var actions = document.createElement('div');
        actions.className = 'agy-cat-row';
        actions.style.flexWrap = 'nowrap';

        var instBtn = document.createElement('button');
        instBtn.type = 'button';
        instBtn.className = 'agy-cat-btn ' + (isInstalled ? '' : 'agy-cat-btn-primary');
        instBtn.disabled = isBusy;
        instBtn.textContent = isBusy ? 'Installing...' : (isInstalled ? 'Reinstall' : 'Install');
        instBtn.addEventListener('click', function () {
          catalogueJobsInFlight[key] = true;
          catalogueStatus = { type: 'info', message: 'Starting installation of ' + item.name + '...' };
          var res = installCatalogueItemViaBridge(item);
          if (!res.ok) {
            delete catalogueJobsInFlight[key];
            catalogueStatus = { type: 'err', message: res.error || 'Failed to start installation' };
          }
          render();
        });
        actions.appendChild(instBtn);

        if (isInstalled && !isBusy) {
          var uninstBtn = document.createElement('button');
          uninstBtn.type = 'button';
          uninstBtn.className = 'agy-cat-btn agy-cat-btn-danger';
          uninstBtn.textContent = 'Remove';
          uninstBtn.addEventListener('click', function () {
            var res = uninstallCatalogueItemViaBridge(item.id, item.isPlugin);
            if (res.ok) {
              catalogueChangesMade = true;
              catalogueStatus = { type: 'ok', message: 'Removed ' + item.name + '.' };
            } else {
              catalogueStatus = { type: 'err', message: res.error || ('Failed to remove ' + item.name) };
            }
            render();
          });
          actions.appendChild(uninstBtn);
        }

        top.appendChild(info);
        top.appendChild(actions);
        card.appendChild(top);

        var desc = document.createElement('div');
        desc.className = 'agy-cat-desc';
        desc.textContent = item.description;
        card.appendChild(desc);

        if (item.repoUrl || item.subPath) {
          var meta = document.createElement('div');
          meta.className = 'agy-cat-meta';
          meta.textContent = item.repoUrl + (item.subPath ? ' (' + item.subPath + ')' : '');
          card.appendChild(meta);
        } else {
          var builtMeta = document.createElement('div');
          builtMeta.className = 'agy-cat-meta';
          builtMeta.textContent = 'Built-in Antigravity system skill';
          card.appendChild(builtMeta);
        }

        list.appendChild(card);
      });
    }
    body.appendChild(list);
    modal.appendChild(body);
    if (prevScroll > 0) {
      body.scrollTop = prevScroll;
    }

    // Footer
    var footer = document.createElement('div');
    footer.className = 'agy-cat-footer';

    var countHint = document.createElement('div');
    countHint.className = 'agy-cat-subtitle';
    countHint.textContent = 'Installed: ' + installed.plugins.length + ' plugin(s), ' + installed.skills.length + ' skill(s)';

    var footerBtns = document.createElement('div');
    footerBtns.className = 'agy-cat-row';

    if (catalogueChangesMade) {
      var reloadBtn = document.createElement('button');
      reloadBtn.type = 'button';
      reloadBtn.className = 'agy-cat-btn agy-cat-btn-primary';
      reloadBtn.textContent = 'Reload Core';
      reloadBtn.addEventListener('click', function () {
        if (restartCoreViaBridge()) {
          catalogueChangesMade = false;
          catalogueStatus = { type: 'ok', message: 'Core Engine restarting to index updated skills & plugins...' };
          render();
        }
      });
      footerBtns.appendChild(reloadBtn);
    }

    var doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'agy-cat-btn';
    doneBtn.textContent = 'Close';
    doneBtn.addEventListener('click', closeCatalogueModal);
    footerBtns.appendChild(doneBtn);

    footer.appendChild(countHint);
    footer.appendChild(footerBtns);
    modal.appendChild(footer);
  }

  activeCatalogueRender = render;
  document.body.appendChild(backdrop);
  render();
}
