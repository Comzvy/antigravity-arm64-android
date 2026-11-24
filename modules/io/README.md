# I/O & Event Bus Subsystem (`modules/io`)

Lightweight publish/subscribe event bus, stream interceptors, and Android/UNIX IPC adapters bridging native OS events with the standalone core runtime.

## Components

| Directory | Key Files | Purpose |
| :--- | :--- | :--- |
| `spec/` | `event_schema.json`, `default_routes.json` | Event envelope JSON schema (`event`, `timestamp`, `source`, `data`) and wildcard route mappings (`core.url.open`, `agent.task.*`, `system.error`, `external.*`). |
| `core_bus/` | `envelope.py`, `subscriber_router.py`, `event_broker.py` | Event validation, wildcard `fnmatch` routing, in-memory callbacks, and timeout-guarded subprocess execution with zombie/FD cleanup. |
| `inputs/` | `fifo_input.py`, `unix_socket_input.py`, `broadcast_receiver.sh` | Non-blocking FIFO (`O_NONBLOCK`, FUSE-safe redirection off `/storage/`) and `AF_UNIX` stream listeners. |
| `interceptors/` | `stream_splitter.py`, `filters/filter_{open_url,task_events,error_alerts}.py` | Queued async `stdout`/`stderr` tee (`queue.Queue`) that intercepts OAuth URLs, task transitions, and panic/fatal errors without blocking the core process. |
| `outputs/` | `notify_tray.sh`, `broadcast_emitter.sh`, `file_sink.py`, `unix_socket_emitter.py` | Delivers tray notifications (`agy-notify`), external URL broadcasts (`com.agy.ACTION_OPEN_URL`), and append-only `events.jsonl` logs. |
| `tests/` | `test_{envelope,event_broker,fifo_io,stream_splitter}.py`, `run_all.sh` | Unit and integration test suite. |

## Tests

```bash
bash modules/io/tests/run_all.sh
```
