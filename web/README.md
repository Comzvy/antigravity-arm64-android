# Antigravity Web Workbench (`web/`)

React/TypeScript SPA web workbench packaged into Android `assets/web/`, served from local asset cache under `https://127.0.0.1:<port>/`, and bridged to native Android APIs via `window.Android`.

## Layout

| Path | Purpose |
| :--- | :--- |
| `build.sh` | Concatenates fragments from `src.manifest` into `web/generated/**`, runs `patch_main.py` (or `patch_main.js` on hosts without Python 3) against a staged copy of `main.js`, and validates every output with `node --check`. |
| `patch_main.py` / `patch_main.js` | Non-destructive patchers (with identical behavior) injecting **Desktop Mode** into Appearance, **Android Voice Input** (`__agVoiceBridge`), **AudioWorklet/getUserMedia** fixes (`__agVoiceMicWorkletPatch`), **Onboarding/No-Sandbox** mobile presets, **MCP/Plugins fallback** (`__agMcpPluginsFallback`), **Remote Startup** (`__agRemoteStartupPatch`), **Stream Resync** (`__agStreamResyncPatch`), **Composer `+` IME Focus Fix** (`__agComposerPlusPatch`), and **Conversation Folder Drag-and-Drop** (`__agDragFoldersPatch`). |
| `index.html` | App entry HTML loading boot guards, modular `generated/patches/*.js`, `generated/bridge.core.js`, deferred `prism_bundle.js`, and patched `generated/main.js`. |
| `src/boot/` | `custom-elements-guard.js` and `theme-bootstrap.js` (`matchMedia` dark/light hook). |
| `src/core/` | `window.process` polyfill, ConnectRPC `fetch` rewrite (`fetch-rewrite.js`), CSRF injection, and endpoint discovery. |
| `src/patches/` | Modular UI/UX enhancements: `web_optimizations/` (`taps.js` incl. composer `+` touch/IME stabilization, `viewport.js`, `gpu.js`, `mobile-ux.js`), `touch_model_menu/`, `theme_sync/`, `ai_models_menu/`, `catalogue/`, `voice_input/`, and `startup_ready/`. |
| `tests/selftest.sh` | Verifies upstream `web/main.js` stays unmodified, `generated/**` builds cleanly, and no double-IIFE wrappers exist. |

## Build & Test

```bash
bash web/build.sh
bash web/tests/selftest.sh
```
