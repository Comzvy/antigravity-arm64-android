# Antigravity for Android

Run the **Antigravity AI coding agent on Android** (ARM64 APK). Antigravity v2.34.0 (Linux ARM64) runs **natively on Android (Bionic)**, with no PRoot or chroot. Includes a multi-provider AI gateway (Gemini, OpenAI, Claude), voice mode, built-in skills & plugins catalogue, and web terminal.

[![Release](https://img.shields.io/github/v/release/Comzvy/antigravity-arm64-android?style=flat-square&color=38bdf8)](https://github.com/Comzvy/antigravity-arm64-android/releases/latest)
![Android](https://img.shields.io/badge/Android-7.0%2B-3DDC84?style=flat-square)
![ARM64](https://img.shields.io/badge/ARM64-v8.0%2B-6366F1?style=flat-square)
[![License](https://img.shields.io/badge/License-Apache--2.0-F59E0B?style=flat-square)](LICENSE)

**[Download APK](https://github.com/Comzvy/antigravity-arm64-android/releases/latest)** · [Release Notes](RELEASE_NOTES.md)

<img alt="Antigravity for Android" src="docs/assets/hero_dark.png" width="100%" />

## Features

- **Native core**: `language_server` runs directly on Bionic with `liblse_compat.so` (LSE emulation).
- **Multi-provider AI (BYOK)**: Gemini, OpenAI, Claude, OpenRouter, Groq, DeepSeek, or any OpenAI-compatible endpoint.
- **Voice mode**: speech recognition, cloud transcription, and text-to-speech.
- **Web terminal**: PTY bash, the `pkg` package manager, and the `agy-daemon` scheduler.
- **Mobile UX**: theme sync, wake lock, file picker, bottom sheets, persistent status bar notification with **Stop** control.
- **Skills & Plugins Catalogue**: built-in Beta catalogue (`10` plugins, `23` skills) with one-tap install/uninstall via `CatalogueManager`.
- **Shizuku**: elevated ADB shell (`rish`) and notifications (`agy-notify`).

## Quick Start

1. Download `antigravity.apk` from the [latest release](https://github.com/Comzvy/antigravity-arm64-android/releases/latest).
2. Grant **All Files Access**, and **Microphone** if you use voice mode (optional: Shizuku).
3. In the built-in terminal:
   ```bash
   pkg update && pkg install git python nodejs bash
   ```
4. Add your API keys under **Settings ➔ AI Models & API Keys**.

## Build from Source

```bash
bash build.sh          # dist/antigravity.apk
bash build.sh --dev    # dist/antigravity-dev.apk
bash test_all_modules.sh
```

## Structure

| Folder | Contents |
| :--- | :--- |
| [`app/`](app/) | Android host (Activities, WebView, AI router, services) |
| [`web/`](web/) | Workbench UI and JS patches |
| [`modules/`](modules/) | APK builder, runtime, ELF patchers, runner |
| [`env/`](env/) | Userspace scripts, `pkg`, `agy-daemon` |
| [`config/`](config/) | Version and runtime constants |
| [`docs/`](docs/) | Image assets |

---

<sub>Maintained by [Comzvy](https://github.com/Comzvy) · Licensed under [Apache-2.0](LICENSE)</sub>
