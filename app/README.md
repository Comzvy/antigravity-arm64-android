# Antigravity Android Host (`app/`)

Native Android host shell (`com.agy`, `minSdk 24`, `targetSdk 28`, ARM64) for running Antigravity **v2.35.0** on device without PRoot or root access.

## Package Structure

| Package | Key Classes | Responsibility |
| :--- | :--- | :--- |
| `com.agy.core` | `CoreServerService`, `CoreLauncher`, `CoreProcessSupervisor`, `CoreReadyProbe`, `OpenUrlWatcher`, `ForegroundNotification`, `WakeLockHolder`, `BatteryOptimization` | Foreground service lifecycle (`ACTION_STOP_APP`), orphan cleanup, glibc `libloader.so` + `liblse_compat.so` launch, certificate-pinned readiness probing, OAuth URL interception, wake/Wi-Fi locks. |
| `com.agy.ui` | `MainActivity`, `LauncherDarkActivity`, `LauncherLightActivity`, `SplashController`, `AppLifecycle`, `BackNavigator`, `FileDownloader` | Window splash choreography, keep-screen-on, smart hardware-back handling (`__agHandleAndroidBack`), and SAF/DownloadManager/blob downloads. |
| `com.agy.ui.webview` | `WebViewHost`, `AgyWebViewClient`, `AgyWebChromeClient`, `LocalAssetServer`, `AppHtmlInjector`, `AppLoader`, `WebSettingsFactory`, `PopupWindowHandler` | Loopback origin loading (`https://127.0.0.1:<port>/?wsTransport=3`), local asset serving from `files/web/`, CSP & runtime config injection, Desktop Mode switching, permission/file chooser delegation. |
| `com.agy.bridge` | `AndroidBridge`, `UiBridge`, `ThemeBridge`, `EngineBridge`, `EngineConfigJson` | Token-gated (`MessageDigest.isEqual`) `@JavascriptInterface Android` connecting the web workbench to native lifecycle, haptics, Downloads, AI settings, Catalogue, and Voice APIs. |
| `com.agy.ai` | `AiModelManager` | On-device `SharedPreferences` BYOK vault (`agy_ai_models_prefs`), OpenAI ↔ Anthropic `/v1/messages` SSE translation, Gemini/Groq/OpenAI cloud audio transcription, and `~/.antigravity/settings.json` sync. |
| `com.agy.plugins` | `CatalogueManager` | Safe archive extraction (`PathSafety`) and lifecycle management for bundled Skills & Plugins Catalogue items and the `rtk` ARM64 binary. |
| `com.agy.gateway` | `SystemGatewayServer`, `GatewayDispatcher`, `handlers/*` | Loopback HTTP gateway (`127.0.0.1:45160`) serving `notify`, `open_url`, `wakelock`, `clipboard`, `system_info`, `vibrate`, `toast`, `exec` (including `rish`), and `/v1/chat/completions` + `/v1/messages`. |
| `com.agy.voice` | `VoiceBridge` | Streaming `SpeechRecognizer`, `RecognizerIntent` dialog fallback, and `TextToSpeech` playback. |
| `com.agy.install` | `EnvInstaller`, `BootstrapExtractor`, `OverlayCopier`, `PkgInstaller`, `SeedPackageInstaller`, `TermuxPrefixRewriter`, `TermuxShebangRewriter`, `TermuxSymlinkFixer` | First-run extraction and prefix relocation for the Bionic `$PREFIX` userland. |
| `com.agy.oauth` | `OAuthManager`, `CustomTabLauncher`, `DeepLinkHandler`, `OAuthTokenStore`, `AuthUrlMatcher` | External Chrome Custom Tabs OAuth flow and `antigravity://` callback handling. |
| `com.agy.theme` | `ThemeManager`, `ThemeController`, `ThemePrefs`, `ThemeResolver`, `ActivityPainter`, `WebViewPainter`, `LauncherIconSwitcher` | Synchronized Light/Dark/System palette updates across WebView, system bars, and launcher activity aliases. |
| `com.agy.shell` | `ShizukuBridge`, `RishExecutor`, `RishLocator` | Optional elevated ADB shell (`uid=2000`) execution via Shizuku `rish`. |
| `com.agy.log` & `com.agy.net` & `com.agy.util` | `CrashRecorder`, `LogRingBuffer`, `LogRedactor`, `NetworkMonitor`, `DnsCollector`, `AppFileProvider`, `PathSafety`, `DocumentsContractHelper` | Redacted diagnostics, network/DNS monitoring, and canonical-path-guarded SAF/file providers. |
