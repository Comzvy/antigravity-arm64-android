# Bionic Userland Environment (`env/`)

Self-contained AArch64 Android Bionic userland prefix (`$PREFIX` at `<app-files>/usr`), pure Bash/AWK package manager (`pkg`), path relocation helpers, and runtime service scripts — no root or PRoot required.

## Directory Layout

| Path | Purpose |
| :--- | :--- |
| `build.sh` | Stages `bootstrap.tar.gz`, `overlay/`, `pkg/`, and cryptographic `manifest.json` into `env/dist/env/`. |
| `bootstrap/` | `pack_bootstrap.py` input (`bootstrap-aarch64.zip`), generated `bootstrap.tar.gz`, and ELF prefix helper. |
| `packages/` | Pre-seeded `.deb` packages ingested directly into the initial bootstrap archive (e.g., `git.deb`). |
| `overlay/` | Files copied verbatim into `$PREFIX` (`bin/agy-daemon`, `bin/agy-fix-paths`, `bin/agy-notify`, `bin/agy-upgrade`, `bin/rish`, `etc/profile`, `etc/profile.d/00-env.sh`, `etc/tls/`, `lib/libtermux-exec.so`, `lib/daemon/`). |
| `pkg/` | Pure Bash/AWK package manager (`pkg` + `lib/{db,deb,fetch,index,resolver,util,version}.sh`, `index.awk`, `vercmp.awk`). |
| `liblse_compat/` | C source (`liblse_compat.c`) and glibc shared library (`liblse_compat.so`) emulating ARMv8.1+ LSE atomics, RDM, DotProd, LRCPC, and FCMA instructions on ARMv8.0-A SoCs via `SIGILL` trapping. |
| `scripts/` | `pack_bootstrap.py` and `make_manifest.py`. |
| `tests/` | `selftest` (offline `pkg`/vercmp/resolver/deb checks), `invariant` (1:1 staging & symlink checks), and `e3` (full live prefix verification). |

## Prefix Relocation & Runtime Separation

- **Bionic vs. Glibc isolation:** Terminal tools (`bash`, `git`, `pkg`, Python) link against Android Bionic libc in `$PREFIX`, while `language_server` runs under glibc via `libloader.so --preload liblse_compat.so`. Consequently, `00-env.sh` only preloads `$PREFIX/lib/liblse_compat.so` if present in the Bionic prefix and keeps `$PREFIX/lib` separate from the core glibc library path.
- **Dynamic path rewriting:** `EnvInstaller` rewrites hardcoded Termux paths and absolute symlinks inside `$PREFIX` on install; `pkg install` invokes `rewrite_prefix`, and users can run `agy-fix-paths` after installing scripts via `pip` or `npm`.

## Commands & Tests

```bash
bash env/build.sh bootstrap   # Repack bootstrap-aarch64.zip + packages/*.deb -> bootstrap.tar.gz
bash env/build.sh assets      # Stage env/dist/env + manifest.json
bash env/tests/selftest       # Offline pkg & script unit tests
bash env/tests/invariant      # Verify 1:1 staged assets and symlink count
bash env/tests/e3             # Live extraction + Bionic exec + curl TLS + pkg install test
```
