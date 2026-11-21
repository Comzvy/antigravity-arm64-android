(function(){
/**
 * patches/catalogue/config.js - Catalogue metadata (10 plugins, 23 skills) & bridge I/O.
 *
 * First fragment of patches/catalogue.js: owns the guard and shared scope.
 */
'use strict';

if (window.__agCatalogue && window.__agCatalogue.__installed) {
  return;
}

var CATALOGUE_PLUGINS = [
  {
    id: 'rtk',
    name: 'rtk',
    category: 'Optimization',
    isPlugin: true,
    repoUrl: 'https://github.com/rtk-ai/rtk.git',
    subPath: '',
    description: 'Runtime Tool Kit: condensates command output, saving context window tokens on terminal operations.'
  },
  {
    id: 'antislop',
    name: 'antislop',
    category: 'Quality & Filter',
    isPlugin: true,
    repoUrl: 'https://github.com/miqdadbadjuber/anti-slop.git',
    subPath: '',
    description: 'Global anti-slop enforcement plugin applying core quality filters across all agents and models.'
  },
  {
    id: 'superpowers',
    name: 'superpowers',
    category: 'Developer Tools',
    isPlugin: true,
    repoUrl: 'https://github.com/obra/superpowers.git',
    subPath: '',
    description: 'Superpowers developer framework: TDD, systematic debugging, plan-driven execution, and parallel subagents.'
  },
  {
    id: 'impeccable',
    name: 'impeccable',
    category: 'UI & Visual',
    isPlugin: true,
    repoUrl: 'https://github.com/pbakaus/impeccable.git',
    subPath: '',
    description: 'Design engineering plugin enforcing rigorous frontend craft, typography scale, and layout hygiene.'
  },
  {
    id: 'context-mode',
    name: 'context-mode',
    category: 'Optimization',
    isPlugin: true,
    repoUrl: 'https://github.com/mksglu/context-mode.git',
    subPath: '',
    description: 'Local sandbox plugin keeping tool output out of context window using SQLite FTS5 search (99% fewer bytes).'
  },
  {
    id: 'agents-suite',
    name: 'agents-suite',
    category: 'Developer Tools',
    isPlugin: true,
    repoUrl: 'https://github.com/wshobson/agents.git',
    subPath: '',
    description: 'Curated multi-agent behaviors, commands, and validation suite adapted specifically for Antigravity CLI.'
  },
  {
    id: 'planning-with-files',
    name: 'planning-with-files',
    category: 'Productivity',
    isPlugin: true,
    repoUrl: 'https://github.com/OthmanAdi/planning-with-files.git',
    subPath: '',
    description: 'Persistent file-based planning preventing context rot and compaction loss in long coding sessions.'
  },
  {
    id: 'sepia',
    name: 'sepia',
    category: 'Quality & Filter',
    isPlugin: true,
    repoUrl: 'https://github.com/Nanako0129/sepia.git',
    subPath: '',
    description: 'De-AI narrative and prose quality repair plugin with native architecture repair for Antigravity.'
  },
  {
    id: 'gemini-agent-skills',
    name: 'gemini-agent-skills',
    category: 'Developer Tools',
    isPlugin: true,
    repoUrl: 'https://github.com/saeed-vayghan/gemini-agent-skills.git',
    subPath: '',
    description: 'Curated multi-agent tools and skills library designed for Google Gemini agents.'
  },
  {
    id: 'antigravity-skills-manager',
    name: 'antigravity-skills-manager',
    category: 'System',
    isPlugin: true,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: '',
    description: 'Manager and updater for 300+ Antigravity community agent skills.'
  }
];

var CATALOGUE_SKILLS = [
  {
    id: 'antislop',
    name: 'antislop',
    category: 'Quality & Filter',
    isPlugin: false,
    repoUrl: 'https://github.com/miqdadbadjuber/anti-slop.git',
    subPath: 'skills/antislop',
    description: 'Core quality filter that stops generic AI slop across UI, copywriting, and code generation.'
  },
  {
    id: 'antislop-ui',
    name: 'antislop-ui',
    category: 'UI & Visual',
    isPlugin: false,
    repoUrl: 'https://github.com/miqdadbadjuber/anti-slop.git',
    subPath: 'skills/antislop-ui',
    description: 'Visual design standards: prevents default AI gradients, excessive glassmorphism, and unbranded interfaces.'
  },
  {
    id: 'antislop-copywriting',
    name: 'antislop-copywriting',
    category: 'Copywriting',
    isPlugin: false,
    repoUrl: 'https://github.com/miqdadbadjuber/anti-slop.git',
    subPath: 'skills/antislop-copywriting',
    description: 'Natural copy and human tone: eliminates robotic phrasing, generic marketing jargon, and AI clichés.'
  },
  {
    id: 'antislop-human',
    name: 'antislop-human',
    category: 'Accessibility',
    isPlugin: false,
    repoUrl: 'https://github.com/miqdadbadjuber/anti-slop.git',
    subPath: 'skills/antislop-human',
    description: 'Accessibility and ergonomics: contrast checks, tap targets, focus states, and keyboard navigation.'
  },
  {
    id: 'antislop-layoutmobile',
    name: 'antislop-layoutmobile',
    category: 'UI & Visual',
    isPlugin: false,
    repoUrl: 'https://github.com/miqdadbadjuber/anti-slop.git',
    subPath: 'skills/antislop-layoutmobile',
    description: 'Mobile and responsive layout constraints: screen reflow, bottom sheets, and responsive grids.'
  },
  {
    id: 'antislop-code',
    name: 'antislop-code',
    category: 'Development',
    isPlugin: false,
    repoUrl: 'https://github.com/miqdadbadjuber/anti-slop.git',
    subPath: 'skills/antislop-code',
    description: 'Code comment hygiene: removes obvious restatements, keeps high-value architectural comments.'
  },
  {
    id: 'antigravity-guide',
    name: 'antigravity-guide',
    category: 'System Guide',
    isPlugin: false,
    repoUrl: '',
    subPath: '',
    description: 'Comprehensive guide and sitemap for Google Antigravity, AGY CLI, and runtime architecture.'
  },
  {
    id: 'agy-customizations',
    name: 'agy-customizations',
    category: 'System Guide',
    isPlugin: false,
    repoUrl: '',
    subPath: '',
    description: 'Complete guide for authoring custom skills, rules, hooks, and MCP servers in Antigravity.'
  },
  {
    id: 'generative_ui',
    name: 'generative_ui',
    category: 'UI & Visual',
    isPlugin: false,
    repoUrl: '',
    subPath: '',
    description: 'Interactive inline HTML widgets, diagrams, controls, and rich visual components.'
  },
  {
    id: 'api-design-principles',
    name: 'api-design-principles',
    category: 'Architecture',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/api-design-principles',
    description: 'RESTful and RPC API design standards, OpenAPI specs, URL schema conventions, and error handling protocols.'
  },
  {
    id: 'architect-review',
    name: 'architect-review',
    category: 'Architecture',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/architect-review',
    description: 'System architecture review, component decoupling, scalability bottlenecks, and architectural decision records.'
  },
  {
    id: 'async-python-patterns',
    name: 'async-python-patterns',
    category: 'Development',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/async-python-patterns',
    description: 'AsyncIO concurrency patterns, task pools, event loops, non-blocking I/O, and race condition prevention.'
  },
  {
    id: 'fastapi-pro',
    name: 'fastapi-pro',
    category: 'Development',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/fastapi-pro',
    description: 'FastAPI best practices, dependency injection, Pydantic v2 schemas, async routing, and OAuth2 integration.'
  },
  {
    id: 'git-advanced-workflows',
    name: 'git-advanced-workflows',
    category: 'Development',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/git-advanced-workflows',
    description: 'Interactive git rebasing, submodules, bisect debugging, patch workflows, and branch lifecycle management.'
  },
  {
    id: 'code-review-excellence',
    name: 'code-review-excellence',
    category: 'Quality & Filter',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/code-review-excellence',
    description: 'Automated rigorous code reviews, identifying logical flaws, memory leaks, and anti-patterns.'
  },
  {
    id: 'backend-security-coder',
    name: 'backend-security-coder',
    category: 'Security',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/backend-security-coder',
    description: 'Backend security hardening, SQL injection prevention, cryptographically secure tokens, and sanitization.'
  },
  {
    id: 'database-architect',
    name: 'database-architect',
    category: 'Data',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/database-architect',
    description: 'Relational database schema modeling, indexing strategy, foreign key constraints, and query plan optimization.'
  },
  {
    id: 'database-migration',
    name: 'database-migration',
    category: 'Data',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/database-migration',
    description: 'Zero-downtime database schema migrations, rollback strategies, and data integrity validation.'
  },
  {
    id: 'performance-engineer',
    name: 'performance-engineer',
    category: 'Performance',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/performance-engineer',
    description: 'High-performance profiling, memory profiling, CPU bottleneck analysis, and caching architectures.'
  },
  {
    id: 'e2e-testing-patterns',
    name: 'e2e-testing-patterns',
    category: 'Testing',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: 'skills/e2e-testing-patterns',
    description: 'End-to-end testing frameworks, hermetic test environments, mock servers, and automated assertions.'
  },
  {
    id: 'superpowers',
    name: 'superpowers',
    category: 'Engineering',
    isPlugin: false,
    repoUrl: 'https://github.com/obra/superpowers.git',
    subPath: '',
    description: 'Complete vault of 15 core engineering skills: TDD, systematic debugging, code reviews, plans, and parallel subagents.'
  },
  {
    id: 'impeccable',
    name: 'impeccable',
    category: 'UI & Visual',
    isPlugin: false,
    repoUrl: 'https://github.com/pbakaus/impeccable.git',
    subPath: '.gemini/skills/impeccable',
    description: 'World-class frontend craft, design systems, visual hierarchy, typography, and responsive micro-interactions.'
  },
  {
    id: 'antigravity-skills-manager',
    name: 'antigravity-skills-manager',
    category: 'Developer Tools',
    isPlugin: false,
    repoUrl: 'https://github.com/rmyndharis/antigravity-skills.git',
    subPath: '',
    description: 'Complete vault containing 300+ Antigravity community agent skills.'
  }
];

function getCatalogueBridgeToken() {
  return window.__AG_NATIVE_BRIDGE_TOKEN__ || '';
}

function listInstalledFromBridge() {
  try {
    if (window.Android && typeof window.Android.listInstalledCatalogue === 'function') {
      var raw = window.Android.listInstalledCatalogue(getCatalogueBridgeToken());
      var parsed = JSON.parse(raw || '{}');
      if (parsed && parsed.ok) {
        return {
          plugins: Array.isArray(parsed.plugins) ? parsed.plugins : [],
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
          builtinSkills: Array.isArray(parsed.builtinSkills) ? parsed.builtinSkills : []
        };
      }
    }
  } catch (e) {
    console.warn('[AGY Catalogue] listInstalledCatalogue error:', e);
  }
  return { plugins: [], skills: [], builtinSkills: [] };
}

function installCatalogueItemViaBridge(item) {
  try {
    if (window.Android && typeof window.Android.installCatalogueItem === 'function') {
      var raw = window.Android.installCatalogueItem(getCatalogueBridgeToken(), JSON.stringify(item));
      return JSON.parse(raw || '{}');
    }
    return { ok: false, error: 'Android Catalogue bridge is unavailable' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function uninstallCatalogueItemViaBridge(id, isPlugin) {
  try {
    if (window.Android && typeof window.Android.uninstallCatalogueItem === 'function') {
      var raw = window.Android.uninstallCatalogueItem(getCatalogueBridgeToken(), String(id || ''), Boolean(isPlugin));
      return JSON.parse(raw || '{}');
    }
    return { ok: false, error: 'Android Catalogue bridge is unavailable' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function restartCoreViaBridge() {
  try {
    if (window.Android && typeof window.Android.restartCoreForCatalogue === 'function') {
      return Boolean(window.Android.restartCoreForCatalogue(getCatalogueBridgeToken()));
    }
  } catch (_) {}
  return false;
}

/**
 * patches/catalogue/styles.js - Theme-aware CSS for the Skills & Plugins Catalogue UI.
 */

var CATALOGUE_STYLE_ID = 'agy-catalogue-styles';

function ensureCatalogueStyles() {
  if (document.getElementById(CATALOGUE_STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = CATALOGUE_STYLE_ID;
  style.textContent = [
    '.agy-cat-backdrop {',
    '  position: fixed; inset: 0; z-index: 99999;',
    '  background: rgba(0, 0, 0, 0.62);',
    '  backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 12px; animation: agyCatFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);',
    '}',
    '@keyframes agyCatFadeIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }',
    '.agy-cat-modal {',
    '  width: 100%; max-width: 720px; max-height: min(calc(var(--agy-vvh, 100vh) - 20px), 800px);',
    '  background: var(--card, #141824); color: var(--foreground, #f1f5f9);',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.22));',
    '  border-radius: 16px; box-shadow: 0 22px 55px rgba(0, 0, 0, 0.55);',
    '  display: flex; flex-direction: column; overflow: hidden; font-family: inherit;',
    '}',
    '.agy-cat-drag-pill {',
    '  width: 38px; height: 4px; border-radius: 999px;',
    '  background: rgba(148, 163, 184, 0.36); margin: 8px auto 0 auto; display: none;',
    '}',
    '@media (max-width: 640px) {',
    '  .agy-cat-backdrop { align-items: flex-end; padding: 0; }',
    '  .agy-cat-modal {',
    '    max-width: 100%; max-height: calc(var(--agy-vvh, 100vh) - 12px);',
    '    border-radius: 20px 20px 0 0; border-bottom: none;',
    '  }',
    '  .agy-cat-drag-pill { display: block; }',
    '}',
    'html.light .agy-cat-modal {',
    '  background: #ffffff; color: #0f172a;',
    '  border-color: rgba(15, 23, 42, 0.15);',
    '  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);',
    '}',
    '.agy-cat-header {',
    '  padding: 12px 18px 14px 18px; border-bottom: 1px solid var(--border, rgba(148, 163, 184, 0.18));',
    '  display: flex; align-items: center; justify-content: space-between; gap: 12px;',
    '}',
    '.agy-cat-title { font-size: 16px; font-weight: 600; margin: 0; }',
    '.agy-cat-subtitle { font-size: 12px; opacity: 0.72; margin-top: 2px; line-height: 1.35; }',
    '.agy-cat-body {',
    '  padding: 14px 18px; overflow-y: auto; -webkit-overflow-scrolling: touch;',
    '  flex: 1; display: flex; flex-direction: column; gap: 12px;',
    '}',
    '.agy-cat-footer {',
    '  padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px)) 18px;',
    '  border-top: 1px solid var(--border, rgba(148, 163, 184, 0.18));',
    '  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;',
    '  background: rgba(128, 128, 128, 0.04);',
    '}',
    '.agy-cat-tabs {',
    '  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;',
    '  background: rgba(128, 128, 128, 0.1); padding: 4px; border-radius: 10px;',
    '}',
    '.agy-cat-tab {',
    '  border: none; background: transparent; color: inherit;',
    '  padding: 9px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600;',
    '  cursor: pointer; transition: all 0.15s ease; text-align: center;',
    '}',
    '.agy-cat-tab.active {',
    '  background: #0284c7; color: #ffffff; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.35);',
    '}',
    '.agy-cat-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
    '.agy-cat-input {',
    '  flex: 1; min-width: 160px; height: 36px; padding: 0 11px; border-radius: 8px;',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.28));',
    '  background: rgba(128, 128, 128, 0.08); color: inherit; font-size: 13px; outline: none;',
    '}',
    '.agy-cat-input:focus { border-color: #38bdf8; }',
    '.agy-cat-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }',
    '.agy-cat-chip {',
    '  font-size: 11px; padding: 4px 10px; border-radius: 999px; font-weight: 600;',
    '  cursor: pointer; border: 1px solid var(--border, rgba(148, 163, 184, 0.26));',
    '  background: rgba(128, 128, 128, 0.08); color: inherit; transition: all 0.14s ease;',
    '}',
    '.agy-cat-chip.active {',
    '  border-color: #38bdf8; background: rgba(56, 189, 248, 0.16); color: #38bdf8;',
    '}',
    'html.light .agy-cat-chip.active {',
    '  border-color: #0284c7; background: rgba(2, 132, 199, 0.12); color: #0284c7;',
    '}',
    '.agy-cat-list { display: flex; flex-direction: column; gap: 8px; }',
    '.agy-cat-card {',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.2));',
    '  border-radius: 10px; padding: 11px 13px; background: rgba(128, 128, 128, 0.04);',
    '  display: flex; flex-direction: column; gap: 8px;',
    '}',
    '.agy-cat-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }',
    '.agy-cat-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }',
    '.agy-cat-name { font-size: 13.5px; font-weight: 600; }',
    '.agy-cat-pill {',
    '  font-size: 10.5px; padding: 2px 7px; border-radius: 999px; font-weight: 600;',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.28)); opacity: 0.85;',
    '}',
    '.agy-cat-pill.installed {',
    '  border-color: rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.14); color: #4ade80; opacity: 1;',
    '}',
    'html.light .agy-cat-pill.installed { color: #15803d; }',
    '.agy-cat-desc { font-size: 12px; opacity: 0.78; line-height: 1.45; }',
    '.agy-cat-meta { font-size: 11px; opacity: 0.6; font-family: monospace; word-break: break-all; }',
    '.agy-cat-btn {',
    '  height: 32px; padding: 0 12px; border-radius: 7px; font-size: 12px; font-weight: 600;',
    '  cursor: pointer; border: 1px solid var(--border, rgba(148, 163, 184, 0.28));',
    '  background: rgba(128, 128, 128, 0.12); color: inherit; white-space: nowrap;',
    '}',
    '.agy-cat-btn:disabled { opacity: 0.55; cursor: not-allowed; }',
    '.agy-cat-btn-primary { background: #0284c7; color: #ffffff; border-color: #0284c7; }',
    '.agy-cat-btn-danger { border-color: rgba(239, 68, 68, 0.45); color: #f87171; background: rgba(239, 68, 68, 0.1); }',
    'html.light .agy-cat-btn-danger { color: #b91c1c; }',
    '.agy-cat-status { font-size: 12px; padding: 8px 11px; border-radius: 8px; }',
    '.agy-cat-status.ok { background: rgba(34, 197, 94, 0.14); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }',
    'html.light .agy-cat-status.ok { color: #15803d; }',
    '.agy-cat-status.err { background: rgba(239, 68, 68, 0.14); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }',
    'html.light .agy-cat-status.err { color: #b91c1c; }',
    '.agy-cat-status.info { background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }',
    'html.light .agy-cat-status.info { color: #0284c7; }',
    '.agy-cat-inline-card {',
    '  width: 100%; box-sizing: border-box;',
    '  border: 1px solid var(--border, rgba(148, 163, 184, 0.24));',
    '  border-radius: 12px; padding: 14px 16px;',
    '  background: rgba(56, 189, 248, 0.06);',
    '  display: flex; flex-direction: column; gap: 10px;',
    '}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);
}

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

/**
 * patches/catalogue/public-api.js - Public API for opening the Skills & Plugins Catalogue.
 */

window.__agCatalogue = {
  __installed: true,
  openModal: openCatalogueModal,
  closeModal: closeCatalogueModal,
  PLUGINS: CATALOGUE_PLUGINS,
  SKILLS: CATALOGUE_SKILLS
};

window.__agOpenCatalogueModal = openCatalogueModal;


})();
