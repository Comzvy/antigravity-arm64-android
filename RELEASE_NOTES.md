# Release Notes — Antigravity Android ARM64 (v2.33.0 Port)

## v2.33.0-arm64 (Linux ARM64 Core Port)

* **Upstream Antigravity v2.33.0 (`Antigravity.tar.gz` Linux ARM64):**
  * Ported the native Linux AArch64 `language_server` (`212,030,128` bytes, Go `go1.28-20261102-RC00`) to run directly on Android ARM64 Bionic userspace via `ld-linux-aarch64.so.1` + `liblse_compat.so`.
  * Updated `modules/patches` signatures (`crash_suppressor`, `nosandbox`, `sigill_handler`, `resolv_redirect`, `cli_gate`, `enterprise_auth`, `faccessat`, `fchmodat`, `pty_shell`) and runtime SHA-256 verification manifests for v2.33.0.
  * Upgraded the frontend workbench bundle (`web/main.js`, `compiled_tailwind.css`, `jetbox.css`, `prism_bundle.js`, `audio_processor.js`, `diff_worker.js`, `symbols-icons/`) to v2.33.0 with updated dynamic patch hooks (`web/patch_main.py`).

## v2.5.0-comzvy (Android Native Enhancements)

### 1. Native Voice-to-Text (STT) & Speech Synthesis (TTS)
* **Real-Time Android `SpeechRecognizer` Bridge (`VoiceBridge.java`):**
  * Streams live partial (`onPartialResults`) and final (`onResults`) speech transcripts directly to the workbench UI with automatic multi-sentence session continuation.
  * Automatically falls back to the system `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` modal when background speech recognition services are restricted.
* **WebAudio WAV Recorder & Cloud Transcription Fallback (`web/src/patches/voice_input/`):**
  * Captures 16 kHz mono PCM WAV audio via `AudioContext` and routes transcription through **Google Gemini Multimodal Audio**, **Groq Whisper (`whisper-large-v3-turbo`)**, or **OpenAI Whisper (`whisper-1`)** when on-device speech services are unavailable.
* **WebView Audio Capture & Polyfills:**
  * Implemented `WebChromeClient.onPermissionRequest` for `RESOURCE_AUDIO_CAPTURE` with runtime `RECORD_AUDIO` permission delegation.
  * Enabled the `enable-audio-transcription` workbench flag and added full polyfills for `window.SpeechRecognition`, `window.webkitSpeechRecognition`, and `window.speechSynthesis` (backed by native Android `TextToSpeech`).

### 2. Multi-Provider AI Models & API Key Gateway (BYOK)
* **Multi-Provider Native Router (`AiModelManager.java`):**
  * Added native support for **Google Gemini**, **OpenAI**, **Anthropic Claude**, **OpenRouter**, **Groq**, **DeepSeek**, and custom OpenAI-compatible endpoints.
  * Secure local key storage in `SharedPreferences` (`agy_ai_models_prefs`) with direct native HTTP execution via `AndroidBridge` to avoid WebView CORS limitations.
* **Settings Integration & Floating Quick Switcher (`web/src/patches/ai_models/`):**
  * Added the **AI Models & API Keys** configuration modal in Settings alongside a draggable floating quick-access button (`🔑`) and live connection testing.

### 3. System Theme Sync, Keep Screen On & Lockscreen Persistence
* **Dynamic Dark / Light Theme Synchronization:**
  * Connected Android's `UiModeManager` and `Configuration.UI_MODE_NIGHT_MASK` to `WebSettingsCompat.setForceDark` and live WebView events (`agy:system-theme-changed`), ensuring the UI automatically follows system Dark/Light mode changes without restarting.
* **Always-On Display While Active:**
  * Enabled hardware `WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON` in `MainActivity` so the screen never dims or locks during active coding sessions.
* **Background & Lockscreen Execution Hardening:**
  * Added `WIFI_MODE_FULL_LOW_LATENCY` lock, persistent `PARTIAL_WAKE_LOCK` renewal, battery optimization exemption request (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`), and WebView background timer persistence so builds and AI tasks continue uninterrupted when minimized or on the lockscreen.

### 4. Android Mobile UI & UX Optimizations (`mobile-ux.js`, `BackNavigator.java`, `AndroidBridge.java`)
* **Native Tactile Haptic Feedback & Micro-Interactions:**
  * Exposed `AndroidBridge.performHapticFeedback()` and `AndroidBridge.showToast()`, providing subtle hardware key-tap vibrations (`KEYBOARD_TAP`) and tactile button press scaling (`scale(0.96)`).
* **Smart Android Back Navigation & Double-Back Exit Guard:**
  * Upgraded `BackNavigator` to dismiss open WebView modals/dialogs or active input focus first via `window.__agHandleAndroidBack()`, followed by a 2-second double-back confirmation toast before minimizing the app.
* **Responsive Bottom-Sheet Modals & Live Voice HUD:**
  * Adapted the AI Models modal into a mobile bottom sheet with drag handle on viewports `<= 640px` and added a floating pulsing Voice HUD during speech recognition.

---

## Release Package Specifications

| Package File | Application ID | Runtime Port | Description |
| :--- | :--- | :--- | :--- |
| **`antigravity.apk`** | `com.agy` | `45157` | Standard release edition with default authentication checks. |
| **`antigravity-region-bypass.apk`** | `com.agy` | `45157` | Release edition with region and account eligibility check bypass. |
| **`SHA256SUMS.txt`** | — | — | Cryptographic SHA-256 checksums for release artifacts. |

---

## Core Foundation Highlights (v2.4.x)

* **Integrated Web Terminal & PTY Spawner:** Binary-patched PTY shell path (`/bin/bash` ➔ `/bin///sh`) with automatic `$SHELL` hierarchy (`$PREFIX/bin/bash` ➔ `runtime/bin/bash` ➔ `/system/bin/sh`) and `xterm-256color` terminfo support.
* **ARMv8.0-A Compatibility (`liblse_compat.so`):** Dynamic emulation of ARMv8.1 LSE atomic instructions via `sigill_handler`, preventing `SIGILL` crashes on Cortex-A53 / Snapdragon 680/685 devices.
* **Native System File Picker:** Full Android Intent file selector with persistent URI permissions (`FLAG_GRANT_PERSISTABLE_URI_PERMISSION`).
* **Background Micro-Daemon (`agy-daemon`):** Ultra-lightweight (<10 MB RAM) background scheduler for cron jobs, file watchers, and status bar notifications (`agy-notify`).
* **Modular Gradle-Free Build System:** Isolated subsystems (`modules/core`, `modules/patches`, `modules/io`, `modules/env`, `modules/builder`, `modules/runner`) capable of building signed APKs directly on Android ARM64.
