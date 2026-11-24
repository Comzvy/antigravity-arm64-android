# Core Binary Patch Pipeline (`modules/patches`)

Modular AArch64 ELF binary patcher for Adapting the Linux ARM64 `language_server` binary (**v2.35.0**) to run directly under Android's seccomp policy, Bionic filesystem layout, and ARMv8.0-A CPUs.

## Architecture

| Path | Role |
| :--- | :--- |
| `pipeline.py` | CLI and Python orchestrator running all 9 patch modules (`--verify`, `--dry-run`, `--allow-missing`, `--skip-gates`, `--manifest`). |
| `engine/` | `elf_scanner.py` (ELF64/.text + `PT_LOAD` fallback), `pclntab_scanner.py` (cached Go `pclntab` lookup + AArch64 `MOVZ` encoder), `byte_replacer.py`, `patch_context.py`, `reporter.py`. |
| `spec/` | `patch_manifest.json` |
| `tests/` | `test_byte_replacer.py`, `test_elf_scanner.py`, `test_pclntab_scanner.py`, `test_pty_shell.py`, `test_full_pipeline.py`, `run_all.sh`. |

## Patch Modules (`groups/`)

| Group | Module | Target & Behavior |
| :--- | :--- | :--- |
| `gates/` | `cli_gate.py` | Bypasses CLI gate checks (`ldrb w1, [x0, #8]` -> `mov w1, #1`) unless `--skip-gates`. |
| `gates/` | `enterprise_auth.py` | Forces `EnterpriseAuthValidator.Validate` gate bit unless `--skip-gates`. |
| `syscalls/` | `faccessat.py` | Retargets `syscall.faccessat2` (`439`) to `faccessat` (`48`) via Go `pclntab` to avoid Android seccomp traps. |
| `syscalls/` | `fchmodat.py` | Retargets `syscall.fchmodat2` (`452`) to `fchmodat` (`53`) via Go `pclntab`. |
| `sigill/` | `sigill_handler.py` | Skips Go `rt_sigaction` installation for `SIGILL` (4) so `liblse_compat.so` retains its handler. |
| `resolv/` | `resolv_redirect.py` | Rewrites `/etc/resolv.conf` to relative `etc//resolv.conf` in-place (16 bytes). |
| `failfast/` | `crash_suppressor.py` | Skips ARMv8.1+ preinit CPU feature gate and rewrites preinit `ldaddal` atomic initialization inside `PT_LOAD` `PF_X`. |
| `pty_shell/` | `pty_shell.py` | Rewrites `/bin/bash` (9 bytes) to `/bin///sh` for POSIX PTY shell compatibility on Android. |
| `pty_shell/` | `nosandbox.py` | Forces `exebox.newBox` `NoSandbox=true` and `RunCommandHandler.isSandboxEnabled=false` so terminal commands run in-process without user-namespace `sbox`. |

## Usage & Tests

```bash
python3 modules/patches/pipeline.py /path/to/language_server [--verify|--dry-run|--skip-gates]
bash modules/patches/tests/run_all.sh
```
