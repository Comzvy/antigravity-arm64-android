# Environment & System Gateway Client (`modules/env`)

Python runtime helpers and CLI tools providing package-ID-independent Android path resolution, host preflight diagnostics, crash flight-recording, structured command logging, and loopback communication with `SystemGatewayServer`.

## Layout

| Path | Key Files | Purpose |
| :--- | :--- | :--- |
| `spec/` | `paths.json`, `env_vars.json` | Parameterized path templates (`{package_name}` -> `com.agy` / `com.agy.dev`) and environment defaults (`LANG`, `GODEBUG=netdns=go`, `PATH`, `LD_LIBRARY_PATH`). |
| `context/` | `path_resolver.py`, `env_builder.py` | Dynamically resolves `AGY_APPLICATION_ID`, `$HOME`, `$PREFIX`, and sanitizes subpaths (`rel_path.lstrip("/")`). |
| `diagnostics/` | `preflight.py`, `port_checker.py` | Verifies ARM64 architecture, writable `$HOME`, free disk space, and loopback port availability. |
| `logging/` | `log.py`, `flight_recorder.py` | ANSI/JSONL logger (`NO_COLOR`-aware) and structured crash snapshot writer. |
| `bridge/` | `client.py`, `commands.py` | Resolves `gateway.port` (`45160` / `45161`) and invokes typed Android Gateway commands (`notify`, `cancel_notify`, `open_url`, `wakelock`, `clipboard_get`, `clipboard_set`, `system_info`). |
| `cmd/` & `cli/` | `runner.py`, `agy_system.py`, `agy_logs.py` | Audited shell command runner (`commands.jsonl`) and CLI utilities for Gateway control and log inspection. |
| `tests/` | `test_{context,diagnostics,logging,bridge,cli}.py`, `run_all.sh` | Complete unit test suite. |

## Tests

```bash
bash modules/env/tests/run_all.sh
```
