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
