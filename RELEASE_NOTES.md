# Release Notes — Antigravity for Android (ARM64)

## v2.34.0

### Core Runtime & Web Sync
- **Upstream Antigravity v2.34.0 (Linux ARM64):** Synced the native Linux AArch64 `language_server` (`215,438,000` bytes, Go `go1.28-20261102-RC01`, upstream version `44.9.1`), updated web bundle assets (`web/main.js`, `web/compiled_tailwind.css`, new file icons), and aligned CI release configuration.
- **Updated Binary & Web Patchers:** Updated `crash_suppressor.py` (masked `adrp`/`ldr` and `adrp`/`add` matching inside `PT_LOAD` `PF_X`), `nosandbox.py` (added v2.34.0 `exebox.newBox` and `isSandboxEnabled` signatures alongside v2.33.0), and `web/patch_main.py` (localized anchor searches and generalized minified identifiers).

### Notification & Lifecycle Control
- **Persistent Notification with Stop Action:** Added a **Stop** action (`ic_notification_stop` -> `CoreServerService.ACTION_STOP_APP`) to `ForegroundNotification`, pinned with `FLAG_ONGOING_EVENT | FLAG_NO_CLEAR` + `FOREGROUND_SERVICE_IMMEDIATE` and guarded via `ACTION_REPOST_NOTIFICATION` so it cannot be swiped clear while active. Tapping **Stop** cleanly terminates the Activity, foreground notification, core server, HTTP gateway, wake locks, and `agy-daemon`.

### Skills & Plugins Catalogue
- **Skills & Plugins Catalogue (`10` Plugins, `23` Skills):** Added the Beta APK catalogue UI (`web/generated/patches/catalogue.js`) backed by `CatalogueManager` (`com.agy.plugins`) and `AndroidBridge` (`listInstalledCatalogue`, `installCatalogueItem`, `uninstallCatalogueItem`, `restartCoreForCatalogue`) supporting built-in skill installation, safe GitHub archive extraction, and RTK binary setup.

### Release Package

| Artifact | Package ID | Runtime Port | Description |
| :--- | :--- | :--- | :--- |
| **`antigravity.apk`** | `com.agy` | `45157` | Standard production release. |
| **`SHA256SUMS.txt`** | — | — | Cryptographic SHA-256 checksum for verification. |

---

## v2.33.0

### Core Runtime & Streaming
- **Upstream Antigravity v2.33.0 (Linux ARM64):** Ported the Linux AArch64 `language_server` (`212,030,128` bytes, Go `go1.28-20261102-RC00`) to run directly in native Android Bionic userspace via `ld-linux-aarch64.so.1` and `liblse_compat.so`.
- **`wsTransport=3` Multiplexing & Stream Auto-Resync:** Enabled WebSocket transport multiplexing in `AppLoader.java` and added automatic agent stream resynchronization in `web/patch_main.py`.
- **ARMv8.0-A Compatibility (`liblse_compat.so`):** Transparent atomic & SIMD instruction emulation for `FEAT_LSE`, `FEAT_RDM`, and `FEAT_FCMA`, preventing `SIGILL` crashes on older ARMv8.0-A SoCs (e.g. Cortex-A53 / Snapdragon 680/685).
- **Built-in Web Terminal & PTY Support:** Binary-patched PTY shell path (`/bin/bash` -> `/bin///sh`) with prioritized `$SHELL` fallback (`$PREFIX/bin/bash` -> `runtime/bin/bash` -> `/system/bin/sh`) and `xterm-256color` terminfo.
- **Modular Patches & Manifest Verification:** Updated `modules/patches` signatures and runtime SHA-256 verification manifests for v2.33.0.

### Multi-Provider AI Gateway (BYOK)
- **Native Router (`AiModelManager.java` & `SystemGatewayServer.java`):** Supports **Google Gemini**, **OpenAI**, **Anthropic Claude** (including custom Anthropic-compatible endpoints), **OpenRouter**, **Groq**, **DeepSeek**, and custom OpenAI-compatible servers.
- **On-Device Key Vault & Manager UI:** Local storage in `SharedPreferences` (`agy_ai_models_prefs`), native HTTP routing via `AndroidBridge`, settings integration, and floating quick switcher (`🔑`).

### Voice Mode & Mobile UX
- **Voice Mode & AudioWorklet CSP:** Fixed microphone capture and `AudioWorklet` CSP handling alongside real-time `SpeechRecognizer`, `RecognizerIntent` dialog fallback, 16 kHz PCM WebAudio cloud transcription (Gemini Audio / Groq Whisper / OpenAI Whisper), and native `TextToSpeech`.
- **Android UI & Lifecycle:** Dynamic Dark/Light system theme sync, `FLAG_KEEP_SCREEN_ON`, `PARTIAL_WAKE_LOCK` + `WIFI_MODE_FULL_LOW_LATENCY` lockscreen persistence, universal media/file picker, tactile haptics, smart double-back exit guard, and responsive bottom-sheet modals.
- **Remote GitHub Project Loading & Diagnostics:** Eager remote GitHub project loading in `OnboardingSeeder` / `WebViewLifecycle`, one-tap log export overlay, Shizuku (`rish`) elevated shell, Torch bridge, `pkg` manager, and `agy-daemon` background task engine.
