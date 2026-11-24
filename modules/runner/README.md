# Standalone Core Lifecycle Runner (`modules/runner`)

Prepares, launches, health-probes, and stops the standalone Antigravity **v2.35.0** `language_server` process on Android ARM64.

## Files

| File | Purpose |
| :--- | :--- |
| `prepare_runtime.py` | Extracts `modules/core/pristine/language_server.tar.gz`, runs `modules/patches/pipeline.py` (with SHA-256 cache verification for full and `--no-bypass` modes), assembles `bin/liblanguage_server.so`, `bin/libloader.so`, `lib/`, `certs/`, `seed/`, and verifies `manifest.json`. |
| `start_core.sh` | Resolves `APP_ID` (`com.agy` / `com.agy.dev`), checks port availability (blocking reserved ports `45157`/`45158`), launches `language_server` via `libloader.so --preload liblse_compat.so` with `stdout`/`stderr` routed through a FIFO to `modules/io/interceptors/stream_splitter.py`, and records `standalone.{pid,pgid,splitter_pid,json}`. |
| `probe_server.py` | Polls `127.0.0.1:<port>` while watching `/proc/<pid>` for fail-fast crash detection. |
| `stop_core.sh` | Verifies `/proc/$PID/cmdline` ownership (`language_server`), sends `SIGTERM` to `-$PGID`, polls until exit, escalates to `SIGKILL` only after timeout, and removes PID files. |
| `test_e2e.sh` | Full prepare -> start -> probe -> stop integration test with `EXIT`/`INT`/`TERM` cleanup traps. |

## Usage

```bash
python3 modules/runner/prepare_runtime.py /data/user/0/com.agy.dev/files/standalone_runtime
bash modules/runner/start_core.sh /data/user/0/com.agy.dev/files/standalone_runtime 45159
python3 modules/runner/probe_server.py 45159 10
bash modules/runner/stop_core.sh /data/user/0/com.agy.dev/files/standalone_runtime
```
