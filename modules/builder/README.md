# APK Build Pipeline (`modules/builder`)

Standalone Android APK compiler and packager that runs cleanly on Linux CI or on-device ARM64 Linux without Gradle or Android Studio. `build_apk.sh` drives standard Android SDK binaries (`aapt`, `javac`, `d8` via `r8.jar`, `zipalign`, `apksigner`) across nine stages.

## Build Stages

| Stage | Script | Inputs | Outputs | Role |
| :--- | :--- | :--- | :--- | :--- |
| **01** | `01_gen_config.py` | `config/app.env`, `AndroidManifest.xml` | `build/gen/**/BuildConfig.java`, `build/res/values/gen.xml`, `build/AndroidManifest.xml` | Injects version constants, ports, and dev/release package ID (`com.agy` / `com.agy.dev`). |
| **02** | `02_r_java.sh` | `AndroidManifest.xml`, `app/src/main/res`, `build/res` | `build/gen/**/R.java` | Generates resource IDs with `--auto-add-overlay`. |
| **03** | `03_compile_java.sh` | `@build/java_sources.txt`, `tools/android.jar` | `build/obj/**/*.class` | Compiles Java 8 bytecode using an `@argfile` to avoid `ARG_MAX`. |
| **04** | `04_dex.sh` | `@build/class_files.txt`, `tools/r8.jar`, `tools/android.jar` | `build/dex/classes.dex` | Compiles classes to Dalvik bytecode (`--min-api 24`). |
| **05** | `05_stage_assets.py` | `modules/core`, `modules/patches`, `web/`, `env/dist/env/` | `build/staging/assets/{runtime,web,env}` | Stages patched `language_server` runtime, runs `web/build.sh` (excluding dev files such as `main.js`, `src/`, `tests/`, `patch_main.*`, `src.manifest`), and copies `env`. |
| **06** | `06_package.sh` | Resources, `classes.dex`, `build/staging/assets/` | `build/unaligned.apk` | Packages base APK and stores compressed archives/media verbatim (`ZIP_STORED`). |
| **07** | `align.py` | `build/unaligned.apk` | `build/aligned.apk` | 4-byte ZIP alignment using `zipalign` or streaming Python fallback. |
| **08** | `08_sign.sh` | `build/aligned.apk`, `tools/debug.keystore` | `dist/antigravity.apk` (or `antigravity-dev.apk`) | Signs APK with v1, v2, and v3 schemes via `apksigner`. |
| **09** | `09_verify.sh` | `dist/*.apk` | Verification stdout | Confirms signature and archive integrity with `apksigner verify`. |

## Usage

```bash
bash modules/builder/build_apk.sh            # Production APK (com.agy, dist/antigravity.apk)
bash modules/builder/build_apk.sh --dev      # Dev APK (com.agy.dev, dist/antigravity-dev.apk)
bash modules/builder/tests/run_all.sh        # Builder module checks
```
