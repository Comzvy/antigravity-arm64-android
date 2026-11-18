/**
 * patches/ai_models_menu/mcp_plugins_fallback.js
 * Provides a built-in MCP Server Store catalog and Build With Google Plugins
 * fallback when running in Custom AI Key / Gateway mode (where language_server's
 * CodeAssistClient is inactive and returns empty or "Plugins not supported for this auth method").
 */

var FALLBACK_MCP_SERVERS = [
  {
    id: 'context7',
    title: 'Context7',
    description: 'Up-to-date code documentation and API references for any library or framework.',
    link: 'https://context7.com',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@upstash/context7-mcp']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'filesystem',
    title: 'Filesystem',
    description: 'Secure file operations with configurable directory access controls.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '${ALLOWED_DIR}']
            },
            variables: [
              { name: 'ALLOWED_DIR', description: 'Allowed directory path (e.g. /storage/emulated/0/Documents)', defaultValue: '/storage/emulated/0/Documents', required: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'sequential-thinking',
    title: 'Sequential Thinking',
    description: 'Dynamic and reflective problem-solving through structured thought sequences.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'memory',
    title: 'Memory (Knowledge Graph)',
    description: 'Persistent memory using a local knowledge graph across conversations.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-memory']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'github',
    title: 'GitHub',
    description: 'Repository management, file operations, issues, pull requests, and code search.',
    link: 'https://github.com/github/github-mcp-server',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
              env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' }
            },
            variables: [
              { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', description: 'GitHub Personal Access Token', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'fetch',
    title: 'Fetch',
    description: 'Web content fetching and conversion to markdown for efficient LLM usage.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          uvx: {
            template: {
              command: 'uvx',
              args: ['mcp-server-fetch']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'playwright',
    title: 'Playwright',
    description: 'Browser automation and web scraping using Playwright accessibility snapshots.',
    link: 'https://github.com/microsoft/playwright-mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@playwright/mcp@latest']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'sqlite',
    title: 'SQLite',
    description: 'Database interaction, schema inspection, and business intelligence on SQLite files.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          uvx: {
            template: {
              command: 'uvx',
              args: ['mcp-server-sqlite', '--db-path', '${DB_PATH}']
            },
            variables: [
              { name: 'DB_PATH', description: 'Path to SQLite database file', required: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'postgres',
    title: 'PostgreSQL',
    description: 'Read-only database access with schema inspection and SQL query execution.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-postgres', '${POSTGRES_URL}']
            },
            variables: [
              { name: 'POSTGRES_URL', description: 'PostgreSQL connection string (postgresql://...)', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'firebase',
    title: 'Firebase',
    description: 'Manage Firebase projects, Firestore, Auth, Hosting, and Cloud Functions.',
    link: 'https://firebase.google.com/docs/cli/mcp-server',
    trustLevel: 'official',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', 'firebase-tools@latest', 'experimental:mcp']
            },
            variables: []
          }
        }
      }
    }
  },
  {
    id: 'supabase',
    title: 'Supabase',
    description: 'Connect to Supabase projects for database queries, migrations, and Edge Functions.',
    link: 'https://supabase.com/docs/guides/getting-started/mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', '${SUPABASE_ACCESS_TOKEN}']
            },
            variables: [
              { name: 'SUPABASE_ACCESS_TOKEN', description: 'Supabase Personal Access Token', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'brave-search',
    title: 'Brave Search',
    description: 'Web and local search using the Brave Search API.',
    link: 'https://github.com/modelcontextprotocol/servers',
    trustLevel: 'verified',
    configuration: {
      case: 'local',
      value: {
        commands: {
          npx: {
            template: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-brave-search'],
              env: { BRAVE_API_KEY: '${BRAVE_API_KEY}' }
            },
            variables: [
              { name: 'BRAVE_API_KEY', description: 'Brave Search API Key', required: true, isSecret: true }
            ]
          }
        }
      }
    }
  },
  {
    id: 'notion',
    title: 'Notion',
    description: 'Search, read, and update Notion pages and databases.',
    link: 'https://developers.notion.com/docs/mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'remote',
      value: {
        template: {
          serverUrl: 'https://mcp.notion.com/mcp'
        }
      }
    }
  },
  {
    id: 'linear',
    title: 'Linear',
    description: 'Create, search, and manage Linear issues, projects, and cycles.',
    link: 'https://linear.app/docs/mcp',
    trustLevel: 'verified',
    configuration: {
      case: 'remote',
      value: {
        template: {
          serverUrl: 'https://mcp.linear.app/mcp'
        }
      }
    }
  }
];

var FALLBACK_BWG_PLUGINS = [
  {
    plugin: {
      uid: 'gemini-api-dev',
      name: 'Gemini API & AI Studio',
      description: 'Best practices, SDK references, and structured output guides for Google Gemini APIs.'
    }
  },
  {
    plugin: {
      uid: 'android-developer',
      name: 'Android & Jetpack Compose',
      description: 'Android architecture, Gradle, Jetpack Compose, and ADB/Shizuku development skills.'
    }
  },
  {
    plugin: {
      uid: 'firebase-developer',
      name: 'Firebase Developer',
      description: 'Skills and guidelines for Firestore, Firebase Auth, Cloud Functions, and Hosting.'
    }
  },
  {
    plugin: {
      uid: 'google-cloud-run',
      name: 'Google Cloud Run',
      description: 'Containerize, deploy, and troubleshoot services on Google Cloud Run.'
    }
  },
  {
    plugin: {
      uid: 'flutter-developer',
      name: 'Flutter Developer',
      description: 'Cross-platform mobile UI and state management best practices for Flutter.'
    }
  }
];

window.__agMcpPluginsFallback = {
  getAvailableCascadePlugins: function (req) {
    var q = (req && req.searchQuery ? String(req.searchQuery) : '').trim().toLowerCase();
    var filtered = !q
      ? FALLBACK_MCP_SERVERS
      : FALLBACK_MCP_SERVERS.filter(function (item) {
          return (
            item.title.toLowerCase().indexOf(q) !== -1 ||
            item.id.toLowerCase().indexOf(q) !== -1 ||
            item.description.toLowerCase().indexOf(q) !== -1
          );
        });
    return { plugins: filtered };
  },
  getBuildWithGooglePlugins: function () {
    return { plugins: FALLBACK_BWG_PLUGINS };
  },
  installPluginLocally: function (uid) {
    var match = null;
    for (var i = 0; i < FALLBACK_BWG_PLUGINS.length; i++) {
      if (FALLBACK_BWG_PLUGINS[i].plugin.uid === uid) {
        match = FALLBACK_BWG_PLUGINS[i].plugin;
        break;
      }
    }
    var name = match ? match.name : uid;
    var desc = match ? match.description : '';
    if (window.Android && typeof window.Android.installLocalPlugin === 'function') {
      var resStr = window.Android.installLocalPlugin(getBridgeToken(), uid, name, desc);
      var res = JSON.parse(resStr || '{}');
      if (!res.ok) {
        throw new Error(res.error || 'Failed to install local plugin');
      }
      return {};
    }
    throw new Error('Android local plugin bridge unavailable');
  },
  removePluginLocally: function (uid) {
    if (window.Android && typeof window.Android.removeLocalPlugin === 'function') {
      var resStr = window.Android.removeLocalPlugin(getBridgeToken(), uid);
      var res = JSON.parse(resStr || '{}');
      if (!res.ok) {
        throw new Error(res.error || 'Failed to remove local plugin');
      }
      return {};
    }
    throw new Error('Android local plugin bridge unavailable');
  }
};
