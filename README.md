# Antigravity for Android

Antigravity v2.33.0 (Linux ARM64) berjalan **native di Android (Bionic)**, tanpa PRoot/chroot. Dilengkapi gateway AI multi-provider, mode suara, dan terminal web bawaan.

[![Release](https://img.shields.io/github/v/release/Comzvy/antigravity-arm64-android?style=flat-square&color=38bdf8)](https://github.com/Comzvy/antigravity-arm64-android/releases/latest)
![Android](https://img.shields.io/badge/Android-7.0%2B-3DDC84?style=flat-square)
![ARM64](https://img.shields.io/badge/ARM64-v8.0%2B-6366F1?style=flat-square)
[![License](https://img.shields.io/badge/License-Apache--2.0-F59E0B?style=flat-square)](LICENSE)

**[Download APK](https://github.com/Comzvy/antigravity-arm64-android/releases/latest)** · [Release Notes](RELEASE_NOTES.md)

<img alt="Antigravity for Android" src="docs/assets/hero_dark.png" width="100%" />

## Fitur

- **Native core**: `language_server` jalan langsung di Bionic dengan `liblse_compat.so` (emulasi LSE).
- **Multi-provider AI (BYOK)**: Gemini, OpenAI, Claude, OpenRouter, Groq, DeepSeek, atau endpoint kompatibel OpenAI.
- **Mode suara**: speech recognition, transkripsi cloud, dan text-to-speech.
- **Terminal web**: PTY bash, package manager `pkg`, dan scheduler `agy-daemon`.
- **UX mobile**: sinkron tema, wake lock, file picker, bottom sheet.
- **Shizuku**: shell ADB elevated (`rish`) dan notifikasi (`agy-notify`).

## Mulai Cepat

1. Unduh `antigravity.apk` dari [rilis terbaru](https://github.com/Comzvy/antigravity-arm64-android/releases/latest).
2. Beri izin **All Files Access**, dan **Microphone** bila memakai mode suara (opsional: Shizuku).
3. Di terminal bawaan:
   ```bash
   pkg update && pkg install git python nodejs bash
   ```
4. Tambah API key di **Settings ➔ AI Models & API Keys**.

## Build dari Source

```bash
bash build.sh          # dist/antigravity.apk
bash build.sh --dev    # dist/antigravity-dev.apk
bash test_all_modules.sh
```

## Struktur

| Folder | Isi |
| :--- | :--- |
| [`app/`](app/) | Host Android (Activity, WebView, AI router, layanan) |
| [`web/`](web/) | UI workbench dan patch JS |
| [`modules/`](modules/) | Builder APK, runtime, patcher ELF, runner |
| [`env/`](env/) | Skrip userspace, `pkg`, `agy-daemon` |
| [`config/`](config/) | Versi dan konstanta runtime |
| [`docs/`](docs/) | Aset gambar |

---

<sub>Dikelola oleh [Comzvy](https://github.com/Comzvy) · Lisensi [Apache-2.0](LICENSE)</sub>
